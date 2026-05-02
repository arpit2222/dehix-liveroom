import { Router } from "express";
import { nanoid } from "nanoid";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { Ticket } from "../models/Ticket.js";
import { Milestone } from "../models/Milestone.js";
import { Nda } from "../models/Nda.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { CreateRoomBody, InviteTalentBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router();

function generateMeetLink(roomCode: string): string {
  return `https://meet.google.com/new`;
}

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateRoomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { title, rawDescription } = parsed.data;
  try {
    const roomCode = nanoid(8).toUpperCase();
    const meetLink = generateMeetLink(roomCode);
    const room = await LiveRoom.create({
      roomCode,
      businessId: req.userId,
      title,
      rawDescription,
      status: "scoping",
      meetLink,
    });
    res.status(201).json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "createRoom error");
    res.status(500).json({ error: "Failed to create room" });
  }
});

router.get("/my", requireAuth, async (req: AuthRequest, res) => {
  try {
    let rooms;
    if (req.userRole === "business") {
      rooms = await LiveRoom.find({ businessId: req.userId }).sort({ createdAt: -1 });
    } else {
      const participations = await RoomParticipant.find({ userId: req.userId }).select("roomId");
      const roomIds = participations.map((p) => p.roomId);
      rooms = await LiveRoom.find({ _id: { $in: roomIds } }).sort({ createdAt: -1 });
    }
    res.json(rooms.map(formatRoom));
  } catch (err) {
    req.log.error({ err }, "getMyRooms error");
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const [roles, participants, tickets, milestones, nda] = await Promise.all([
      RoomRole.find({ roomId: room._id }),
      RoomParticipant.find({ roomId: room._id }).populate("userId", "-password"),
      Ticket.find({ roomId: room._id }),
      Milestone.find({ roomId: room._id }),
      Nda.findOne({ roomId: room._id }),
    ]);
    res.json({
      ...formatRoom(room),
      roles: roles.map(formatRole),
      participants: participants.map(formatParticipant),
      tickets: tickets.map(formatTicket),
      milestones: milestones.map(formatMilestone),
      nda: nda ? formatNda(nda) : null,
    });
  } catch (err) {
    req.log.error({ err }, "getRoom error");
    res.status(500).json({ error: "Failed to get room" });
  }
});

router.get("/:id/participants", requireAuth, async (req: AuthRequest, res) => {
  try {
    const participants = await RoomParticipant.find({ roomId: req.params["id"] }).populate(
      "userId",
      "-password"
    );
    res.json(participants.map(formatParticipant));
  } catch (err) {
    req.log.error({ err }, "getParticipants error");
    res.status(500).json({ error: "Failed to get participants" });
  }
});

router.post("/:id/invite", requireAuth, async (req: AuthRequest, res) => {
  const parsed = InviteTalentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { talentId, roleId } = parsed.data;
  try {
    const existing = await RoomParticipant.findOne({ roomId: req.params["id"], userId: talentId });
    if (existing) {
      res.json({ message: "Already invited" });
      return;
    }
    const participant = await RoomParticipant.create({
      roomId: req.params["id"],
      userId: talentId,
      roleId,
      status: "invited",
    });
    await RoomRole.findByIdAndUpdate(roleId, { status: "invited" });
    const io = getIo();
    if (io) {
      io.to(`talent:${talentId}`).emit("talent:invited", {
        roomId: req.params["id"],
        participantId: participant._id,
      });
    }
    res.json({ message: "Talent invited" });
  } catch (err) {
    req.log.error({ err }, "inviteTalent error");
    res.status(500).json({ error: "Failed to invite talent" });
  }
});

router.post("/:id/assemble", requireAuth, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { status: "assembling" },
      { new: true }
    );
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const io = getIo();
    if (io) {
      io.to(`room:${req.params["id"]}`).emit("room:squad_formed", { roomId: req.params["id"] });
    }
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "assembleSquad error");
    res.status(500).json({ error: "Failed to assemble squad" });
  }
});

router.post("/:id/close", requireAuth, async (req: AuthRequest, res) => {
  try {
    await LiveRoom.findByIdAndUpdate(req.params["id"], { status: "closed" });
    res.json({ message: "Room closed" });
  } catch (err) {
    req.log.error({ err }, "closeRoom error");
    res.status(500).json({ error: "Failed to close room" });
  }
});

function formatRoom(room: InstanceType<typeof LiveRoom>) {
  return {
    _id: room._id,
    roomCode: room.roomCode,
    title: room.title,
    rawDescription: room.rawDescription,
    aiScopedBrief: room.aiScopedBrief ?? null,
    status: room.status,
    meetLink: room.meetLink ?? null,
    businessId: room.businessId,
    createdAt: room.createdAt,
    contractedAt: room.contractedAt ?? null,
  };
}

function formatRole(role: InstanceType<typeof RoomRole>) {
  return {
    _id: role._id,
    roleTitle: role.roleTitle,
    skillDomain: role.skillDomain,
    requiredLevel: role.requiredLevel,
    minReputation: role.minReputation,
    filledBy: role.filledBy ?? null,
    status: role.status,
  };
}

function formatParticipant(p: InstanceType<typeof RoomParticipant>) {
  return {
    _id: p._id,
    userId: p.userId,
    user: (p as any).userId?.email ? (p as any).userId : null,
    roleId: p.roleId ?? null,
    status: p.status,
    joinedAt: p.joinedAt,
  };
}

function formatTicket(t: InstanceType<typeof Ticket>) {
  return {
    _id: t._id,
    roomId: t.roomId,
    title: t.title,
    description: t.description ?? null,
    assignedRole: t.assignedRole ?? null,
    milestoneNumber: t.milestoneNumber,
    estimatedHours: t.estimatedHours ?? null,
    status: t.status,
    createdAt: t.createdAt,
  };
}

function formatMilestone(m: InstanceType<typeof Milestone>) {
  return {
    _id: m._id,
    roomId: m.roomId,
    title: m.title,
    description: m.description ?? null,
    amountUsd: m.amountUsd ?? null,
    dueDate: m.dueDate ?? null,
    status: m.status,
  };
}

function formatNda(n: InstanceType<typeof Nda>) {
  return {
    _id: n._id,
    roomId: n.roomId,
    content: n.content,
    signedBy: n.signedBy,
    status: n.status,
    createdAt: n.createdAt,
  };
}

export default router;
