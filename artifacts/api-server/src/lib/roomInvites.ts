import { LiveRoom } from "../models/LiveRoom.js";
import { Notification } from "../models/Notification.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { RoomRole } from "../models/RoomRole.js";
import { User } from "../models/User.js";
import { getIo } from "../socket.js";

export class RoomInviteError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface InviteTalentToRoomInput {
  room?: InstanceType<typeof LiveRoom>;
  roomId: string;
  talentId: string;
  roleId?: string;
}

export async function inviteTalentToRoom(input: InviteTalentToRoomInput) {
  const room = input.room ?? await LiveRoom.findById(input.roomId);
  if (!room) {
    throw new RoomInviteError(404, "Room not found");
  }

  const talent = await User.findOne({
    _id: input.talentId,
    role: "talent",
    accountStatus: "active",
  }).select("name email");
  if (!talent) {
    throw new RoomInviteError(404, "Talent not found");
  }

  const role = input.roleId
    ? await RoomRole.findOne({ _id: input.roleId, roomId: room._id })
    : null;
  if (input.roleId && !role) {
    throw new RoomInviteError(400, "Role does not belong to this room");
  }

  const existing = await RoomParticipant.findOne({ roomId: room._id, userId: talent._id });
  const alreadyMember = existing?.status === "joined" || existing?.status === "accepted";
  let participant = existing;
  let created = false;
  let reactivated = false;
  let roleChanged = false;

  if (!participant) {
    participant = await RoomParticipant.create({
      roomId: room._id,
      userId: talent._id,
      roleId: role?._id ?? undefined,
      status: "invited",
    });
    created = true;
  } else if (!alreadyMember) {
    const nextRoleId = role?._id ?? participant.roleId;
    roleChanged = String(participant.roleId ?? "") !== String(nextRoleId ?? "");
    reactivated = participant.status !== "invited";
    participant.status = "invited";
    participant.roleId = nextRoleId;
    await participant.save();
  }

  if (role && !alreadyMember && role.status !== "accepted" && role.status !== "filled") {
    role.status = "invited";
    await role.save();
  }

  if (!alreadyMember) {
    await upsertRoomInviteNotification({
      room,
      talentId: String(talent._id),
      roleTitle: role?.roleTitle,
    });
    emitRoomInvite({ room, participant, talentId: String(talent._id), roleId: role?._id ?? participant.roleId ?? null });
  }

  return {
    room,
    role,
    talent,
    participant,
    created,
    reactivated,
    roleChanged,
    alreadyMember,
  };
}

async function upsertRoomInviteNotification({
  room,
  talentId,
  roleTitle,
}: {
  room: InstanceType<typeof LiveRoom>;
  talentId: string;
  roleTitle?: string;
}) {
  const title = "New LiveRoom invitation";
  const roleText = roleTitle ? ` for ${roleTitle}` : "";
  const message = `${room.title}: you have been invited${roleText}.`;
  await Notification.findOneAndUpdate(
    { userId: talentId, type: "room_invite", roomId: room._id, read: false },
    {
      $set: {
        title,
        message,
        roomId: room._id,
        read: false,
      },
      $setOnInsert: {
        userId: talentId,
        type: "room_invite",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function emitRoomInvite({
  room,
  participant,
  talentId,
  roleId,
}: {
  room: InstanceType<typeof LiveRoom>;
  participant: InstanceType<typeof RoomParticipant>;
  talentId: string;
  roleId: unknown;
}) {
  const io = getIo();
  if (!io) return;
  const payload = {
    roomId: String(room._id),
    participantId: String(participant._id),
    roleId: roleId ? String(roleId) : null,
    roomTitle: room.title,
  };
  io.to(`talent:${talentId}`).emit("talent:invited", payload);
  io.to(`room:${String(room._id)}`).emit("room:participant_invited", {
    roomId: String(room._id),
    userId: talentId,
    participantId: String(participant._id),
  });
}
