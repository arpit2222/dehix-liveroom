import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { RoomChannel } from "../models/RoomChannel.js";
import { FreelancerMatch } from "../models/FreelancerMatch.js";
import { ProjectShortlist } from "../models/ProjectShortlist.js";
import { HireOffer, type IHireOffer, type HireOfferStatus } from "../models/HireOffer.js";
import { Nda } from "../models/Nda.js";
import { Milestone } from "../models/Milestone.js";
import { Notification } from "../models/Notification.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { User } from "../models/User.js";
import { getIo } from "../socket.js";
import {
  createTalentJoinedSystemMessage,
  ensureDirectChannelForParticipant,
  formatRoomChannel,
} from "./roomWorkspace.js";

export const openHireOfferStatuses: HireOfferStatus[] = ["draft", "sent", "changes_requested"];

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUser(user: any) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    isOnline: user.isOnline ?? false,
  };
}

export function formatHireOffer(offer: any, related?: { room?: any; role?: any; freelancer?: any; interview?: any }) {
  const room = related?.room ?? offer.roomId;
  const role = related?.role ?? offer.roleId;
  const freelancer = related?.freelancer ?? offer.freelancerId;
  const interview = related?.interview ?? offer.interviewChannelId;
  return {
    _id: offer._id,
    roomId: room?._id ?? offer.roomId,
    room: room?.title
      ? {
          _id: room._id,
          roomCode: room.roomCode,
          title: room.title,
          status: room.status,
          contractedAt: room.contractedAt ?? null,
        }
      : null,
    businessId: offer.businessId,
    freelancerId: freelancer?._id ?? offer.freelancerId,
    freelancer: formatUser(freelancer),
    roleId: role?._id ?? offer.roleId,
    role: role?.roleTitle
      ? {
          _id: role._id,
          roleTitle: role.roleTitle,
          skillDomain: role.skillDomain,
          status: role.status,
          filledBy: role.filledBy ?? null,
        }
      : null,
    interviewChannelId: interview?._id ?? offer.interviewChannelId,
    interview: interview?.name
      ? {
          _id: interview._id,
          name: interview.name,
          displayName: interview.displayName ?? interview.name,
          interviewStatus: interview.interviewStatus ?? null,
          interviewScheduledAt: interview.interviewScheduledAt ?? null,
        }
      : null,
    status: offer.status,
    amountUsd: offer.amountUsd ?? null,
    rateType: offer.rateType,
    rateAmountUsd: offer.rateAmountUsd ?? null,
    startDate: offer.startDate ?? null,
    expectedEndDate: offer.expectedEndDate ?? null,
    scopeSummary: offer.scopeSummary,
    terms: offer.terms,
    milestonePlan: offer.milestonePlan ?? [],
    responseMessage: offer.responseMessage ?? null,
    sentAt: offer.sentAt ?? null,
    respondedAt: offer.respondedAt ?? null,
    withdrawnAt: offer.withdrawnAt ?? null,
    contractedAt: offer.contractedAt ?? null,
    expiresAt: offer.expiresAt ?? null,
    createdAt: offer.createdAt ?? null,
    updatedAt: offer.updatedAt ?? null,
  };
}

export async function formatHireOfferList(offers: any[]) {
  const roomIds = [...new Set(offers.map((offer) => String(offer.roomId)))];
  const roleIds = [...new Set(offers.map((offer) => String(offer.roleId)))];
  const freelancerIds = [...new Set(offers.map((offer) => String(offer.freelancerId)))];
  const interviewIds = [...new Set(offers.map((offer) => String(offer.interviewChannelId)))];
  const [rooms, roles, freelancers, interviews] = await Promise.all([
    LiveRoom.find({ _id: { $in: roomIds } }),
    RoomRole.find({ _id: { $in: roleIds } }),
    User.find({ _id: { $in: freelancerIds } }).select("-password"),
    RoomChannel.find({ _id: { $in: interviewIds } }),
  ]);
  const roomById = new Map(rooms.map((room) => [String(room._id), room]));
  const roleById = new Map(roles.map((role) => [String(role._id), role]));
  const freelancerById = new Map(freelancers.map((freelancer) => [String(freelancer._id), freelancer]));
  const interviewById = new Map(interviews.map((interview) => [String(interview._id), interview]));

  return offers.map((offer) =>
    formatHireOffer(offer, {
      room: roomById.get(String(offer.roomId)),
      role: roleById.get(String(offer.roleId)),
      freelancer: freelancerById.get(String(offer.freelancerId)),
      interview: interviewById.get(String(offer.interviewChannelId)),
    })
  );
}

function buildAgreementContent({
  room,
  role,
  freelancer,
  offer,
}: {
  room: InstanceType<typeof LiveRoom>;
  role: InstanceType<typeof RoomRole>;
  freelancer: any;
  offer: InstanceType<typeof HireOffer>;
}) {
  const milestoneLines = (offer.milestonePlan ?? [])
    .map((milestone, index) => {
      const amount = milestone.amountUsd ? ` - $${Number(milestone.amountUsd).toLocaleString()}` : "";
      const due = milestone.dueDate ? ` - due ${new Date(milestone.dueDate).toISOString().slice(0, 10)}` : "";
      return `${index + 1}. ${milestone.title}${amount}${due}${milestone.description ? `\n   ${milestone.description}` : ""}`;
    })
    .join("\n");

  return [
    "DEHIX LIVE ROOM FREELANCE AGREEMENT",
    "",
    `Project: ${room.title}`,
    `Role: ${role.roleTitle}`,
    `Freelancer: ${freelancer?.name ?? "Selected freelancer"}`,
    `Offer ID: ${String(offer._id)}`,
    "",
    "Scope",
    offer.scopeSummary,
    "",
    "Commercial Terms",
    `Rate type: ${offer.rateType}`,
    `Agreed amount: ${offer.amountUsd ? `$${Number(offer.amountUsd).toLocaleString()}` : "To be managed by milestone releases"}`,
    offer.rateAmountUsd ? `Rate amount: $${Number(offer.rateAmountUsd).toLocaleString()}` : "",
    offer.startDate ? `Start date: ${new Date(offer.startDate).toISOString().slice(0, 10)}` : "",
    offer.expectedEndDate ? `Expected end date: ${new Date(offer.expectedEndDate).toISOString().slice(0, 10)}` : "",
    "",
    "Milestone Escrow Simulation",
    milestoneLines || "Milestones will be managed inside the Live Room. Payment release is simulated until a real gateway is connected.",
    "",
    "Additional Terms",
    offer.terms,
    "",
    "Confidentiality and IP",
    "Both parties agree to keep confidential project information private. Work product belongs to the business after accepted milestone release unless a separate signed agreement states otherwise.",
    "",
    "Signatures",
    "Both parties must sign inside DEHIX before the room becomes contracted.",
  ].filter(Boolean).join("\n");
}

async function createMilestonesFromOffer(offer: InstanceType<typeof HireOffer>) {
  const plan = offer.milestonePlan ?? [];
  if (plan.length === 0) return;
  for (const milestone of plan) {
    const title = String(milestone.title ?? "").trim();
    if (!title) continue;
    const existing = await Milestone.findOne({ roomId: offer.roomId, title });
    if (existing) continue;
    await Milestone.create({
      roomId: offer.roomId,
      title,
      description: milestone.description,
      amountUsd: milestone.amountUsd,
      dueDate: asDate(milestone.dueDate) ?? undefined,
      status: "pending",
    });
  }
}

export async function acceptHireOffer(offer: InstanceType<typeof HireOffer>, actorId: string) {
  const [room, role, freelancer] = await Promise.all([
    LiveRoom.findById(offer.roomId),
    RoomRole.findById(offer.roleId),
    User.findById(offer.freelancerId).select("-password"),
  ]);
  if (!room || !role) {
    throw new Error("Offer room or role was not found");
  }
  if (role.status === "filled" && role.filledBy && String(role.filledBy) !== String(offer.freelancerId)) {
    throw new Error("This role has already been filled");
  }
  const competingAcceptedOffer = await HireOffer.findOne({
    _id: { $ne: offer._id },
    roomId: offer.roomId,
    roleId: offer.roleId,
    status: { $in: ["accepted", "contracted"] },
  });
  if (competingAcceptedOffer) {
    throw new Error("This role already has an accepted offer");
  }

  offer.status = "accepted";
  offer.respondedAt = new Date();
  await offer.save();

  await HireOffer.updateMany(
    {
      _id: { $ne: offer._id },
      roomId: offer.roomId,
      roleId: offer.roleId,
      status: { $in: openHireOfferStatuses },
    },
    { status: "withdrawn", withdrawnAt: new Date() }
  );

  const participant = await RoomParticipant.findOneAndUpdate(
    { roomId: offer.roomId, userId: offer.freelancerId },
    { roomId: offer.roomId, userId: offer.freelancerId, roleId: offer.roleId, status: "accepted" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await RoomRole.findOneAndUpdate(
    { _id: offer.roleId, roomId: offer.roomId },
    { filledBy: offer.freelancerId, status: "filled" }
  );
  await FreelancerMatch.findOneAndUpdate(
    { roomId: offer.roomId, freelancerId: offer.freelancerId, roleId: offer.roleId },
    { status: "hired" }
  );
  await ProjectShortlist.findOneAndUpdate(
    { roomId: offer.roomId, freelancerId: offer.freelancerId, roleId: offer.roleId },
    {
      roomId: offer.roomId,
      businessId: offer.businessId,
      freelancerId: offer.freelancerId,
      roleId: offer.roleId,
      role: role.roleTitle,
      status: "hired",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await createMilestonesFromOffer(offer);

  const agreement = buildAgreementContent({ room, role, freelancer, offer });
  const nda = await Nda.findOneAndUpdate(
    { roomId: offer.roomId },
    { content: agreement, status: "pending_signatures", signedBy: [] },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const io = getIo();
  const directChannel = await ensureDirectChannelForParticipant(room, participant);
  if (directChannel && io) {
    io.to(`room:${room._id}`).emit("room:channel_created", formatRoomChannel(directChannel));
  }
  await createTalentJoinedSystemMessage(room, participant, io);

  await Notification.create({
    userId: offer.businessId,
    type: "hire_offer",
    title: "Hire offer accepted",
    message: `${freelancer?.name ?? "A freelancer"} accepted the ${role.roleTitle} offer.`,
    roomId: offer.roomId,
  });
  RoomActivity.create({
    roomId: offer.roomId,
    type: "hire_offer_accepted",
    actorId,
    meta: { offerId: String(offer._id), freelancerId: String(offer.freelancerId), role: role.roleTitle },
  }).catch(() => {});
  RoomActivity.create({
    roomId: offer.roomId,
    type: "freelancer_hired",
    actorId,
    meta: { offerId: String(offer._id), freelancerId: String(offer.freelancerId), role: role.roleTitle },
  }).catch(() => {});

  if (io) {
    io.to(`room:${room._id}`).emit("room:hire_offer_accepted", { roomId: room._id, offerId: offer._id });
    io.to(`room:${room._id}`).emit("room:participant_joined", { roomId: room._id, userId: offer.freelancerId, status: "accepted" });
    io.to(`talent:${String(offer.freelancerId)}`).emit("talent:hired", { roomId: room._id, roleId: role._id, offerId: offer._id });
    io.to(`room:${room._id}`).emit("room:nda_signed", {
      roomId: room._id,
      signedBy: nda.signedBy,
      status: nda.status,
    });
  }

  return { offer, participant, nda };
}
