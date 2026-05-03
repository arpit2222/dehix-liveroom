import { Router } from "express";
import { nanoid } from "nanoid";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { Ticket } from "../models/Ticket.js";
import { Milestone } from "../models/Milestone.js";
import { Nda } from "../models/Nda.js";
import { RoomActivity } from "../models/RoomActivity.js";
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
    RoomActivity.create({ roomId: room._id, type: "room_created", actorId: req.userId, meta: { title } }).catch(() => {});
    res.status(201).json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "createRoom error");
    res.status(500).json({ error: "Failed to create room" });
  }
});

router.post("/join", requireAuth, async (req: AuthRequest, res) => {
  const { roomCode } = req.body;
  if (!roomCode) { res.status(400).json({ error: "Room code required" }); return; }
  try {
    const room = await LiveRoom.findOne({ roomCode: roomCode.trim().toUpperCase() });
    if (!room) { res.status(404).json({ error: "Room not found. Check the code and try again." }); return; }
    const existing = await RoomParticipant.findOne({ roomId: room._id, userId: req.userId });
    if (existing) {
      res.json({ room: formatRoom(room), alreadyJoined: true });
      return;
    }
    const participant = await RoomParticipant.create({ roomId: room._id, userId: req.userId, status: "joined" });
    const io = getIo();
    if (io) io.to(`room:${room._id}`).emit("room:participant_joined", { roomId: room._id, userId: req.userId, status: "joined" });
    res.json({ room: formatRoom(room), participant, alreadyJoined: false });
  } catch (err) {
    req.log.error({ err }, "joinByCode error");
    res.status(500).json({ error: "Failed to join room" });
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
    const roomIds = rooms.map((r) => r._id);
    const [participantCounts, ticketCounts, milestoneCounts] = await Promise.all([
      RoomParticipant.aggregate([
        { $match: { roomId: { $in: roomIds }, status: "joined" } },
        { $group: { _id: "$roomId", count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        { $match: { roomId: { $in: roomIds } } },
        { $group: { _id: "$roomId", total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } } } },
      ]),
      Milestone.aggregate([
        { $match: { roomId: { $in: roomIds } } },
        { $group: { _id: "$roomId", total: { $sum: 1 }, totalUsd: { $sum: { $ifNull: ["$amountUsd", 0] } }, releasedUsd: { $sum: { $cond: [{ $eq: ["$status", "released"] }, { $ifNull: ["$amountUsd", 0] }, 0] } } } },
      ]),
    ]);
    const pCountMap = new Map(participantCounts.map((p: any) => [String(p._id), p.count]));
    const tCountMap = new Map(ticketCounts.map((t: any) => [String(t._id), { total: t.total, done: t.done }]));
    const mCountMap = new Map(milestoneCounts.map((m: any) => [String(m._id), { total: m.total, totalUsd: m.totalUsd, releasedUsd: m.releasedUsd }]));
    res.json(rooms.map((room) => ({
      ...formatRoom(room),
      participantCount: pCountMap.get(String(room._id)) ?? 0,
      ticketStats: tCountMap.get(String(room._id)) ?? { total: 0, done: 0 },
      milestoneStats: mCountMap.get(String(room._id)) ?? { total: 0, totalUsd: 0, releasedUsd: 0 },
    })));
  } catch (err) {
    req.log.error({ err }, "getMyRooms error");
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

router.get("/:id/activity", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = req.params["id"];
    const [participants, tickets, milestones, nda] = await Promise.all([
      RoomParticipant.find({ roomId }).populate("userId", "name email").sort({ joinedAt: -1 }).limit(10),
      Ticket.find({ roomId }).sort({ createdAt: -1 }).limit(10),
      Milestone.find({ roomId }).sort({ createdAt: -1 }).limit(5),
      Nda.findOne({ roomId }),
    ]);
    const events: any[] = [];
    for (const p of participants) {
      const u = (p as any).userId;
      events.push({
        type: p.status === "joined" ? "participant_joined" : "participant_invited",
        label: p.status === "joined" ? `${u?.name ?? "Someone"} joined the room` : `${u?.name ?? "Someone"} was invited`,
        at: p.joinedAt,
        icon: p.status === "joined" ? "👤" : "✉️",
      });
    }
    for (const t of tickets) {
      events.push({
        type: "ticket",
        label: `Ticket "${t.title}" — ${t.status}`,
        at: t.createdAt,
        icon: t.status === "done" ? "✅" : "🎫",
      });
    }
    for (const m of milestones) {
      events.push({
        type: "milestone",
        label: `Milestone "${m.title}" — ${m.status}${m.amountUsd ? ` ($${m.amountUsd.toLocaleString()})` : ""}`,
        at: m.createdAt,
        icon: m.status === "released" ? "💰" : "🏁",
      });
    }
    if (nda) {
      events.push({
        type: "nda",
        label: nda.status === "signed" ? "NDA fully signed" : nda.status === "pending_signatures" ? `NDA pending signatures (${nda.signedBy.length}/2)` : "NDA generated (draft)",
        at: nda.createdAt,
        icon: "📜",
      });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    res.json(events.slice(0, 15));
  } catch (err) {
    req.log.error({ err }, "getActivity error");
    res.status(500).json({ error: "Failed to get activity" });
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
    const roomId = String(req.params["id"]);
    const existing = await RoomParticipant.findOne({ roomId, userId: talentId });
    if (existing) {
      res.json({ message: "Already invited" });
      return;
    }
    const participant = await RoomParticipant.create({
      roomId,
      userId: talentId,
      roleId,
      status: "invited",
    });
    await RoomRole.findByIdAndUpdate(roleId, { status: "invited" });
    const io = getIo();
    if (io) {
      io.to(`talent:${talentId}`).emit("talent:invited", {
        roomId,
        participantId: participant._id,
      });
    }
    res.json({ message: "Talent invited" });
  } catch (err) {
    req.log.error({ err }, "inviteTalent error");
    res.status(500).json({ error: "Failed to invite talent" });
  }
});

router.post("/:id/contract", requireAuth, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { status: "contracted", contractedAt: new Date() },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:status_changed", { roomId: req.params["id"], status: "contracted" });
    RoomActivity.create({ roomId: String(req.params["id"]), type: "room_contracted", actorId: req.userId }).catch(() => {});
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "contractRoom error");
    res.status(500).json({ error: "Failed to contract room" });
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
    RoomActivity.create({ roomId: String(req.params["id"]), type: "room_closed", actorId: req.userId }).catch(() => {});
    res.json({ message: "Room closed" });
  } catch (err) {
    req.log.error({ err }, "closeRoom error");
    res.status(500).json({ error: "Failed to close room" });
  }
});

router.get("/:id/export", requireAuth, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const [roles, participants, tickets, milestones, nda] = await Promise.all([
      RoomRole.find({ roomId: room._id }),
      RoomParticipant.find({ roomId: room._id }).populate("userId", "name email"),
      Ticket.find({ roomId: room._id }),
      Milestone.find({ roomId: room._id }),
      Nda.findOne({ roomId: room._id }),
    ]);
    const brief = room.aiScopedBrief as any;
    const lines: string[] = [
      `# DEHIX Room Export`,
      `Room: ${room.title} [${room.roomCode}]`,
      `Status: ${room.status}`,
      `Created: ${room.createdAt.toISOString().split("T")[0]}`,
      ``,
    ];
    if (brief) {
      lines.push(`## Project Brief`);
      lines.push(`${brief.projectSummary ?? ""}`);
      lines.push(`Timeline: ${brief.estimatedWeeks ?? "?"} weeks | Complexity: ${brief.complexity ?? "?"} | Budget: $${brief.suggestedTotalBudgetUsd?.toLocaleString() ?? "TBD"}`);
      lines.push(``);
    }
    if (roles.length > 0) {
      lines.push(`## Roles (${roles.length})`);
      for (const r of roles) lines.push(`- ${r.roleTitle} (${r.skillDomain}) — ${r.status}`);
      lines.push(``);
    }
    if (participants.length > 0) {
      lines.push(`## Participants (${participants.length})`);
      for (const p of participants) {
        const u = (p as any).userId;
        lines.push(`- ${u?.name ?? "Unknown"} <${u?.email ?? "?"}> — ${p.status}`);
      }
      lines.push(``);
    }
    if (milestones.length > 0) {
      const totalUsd = milestones.reduce((s, m) => s + (m.amountUsd ?? 0), 0);
      const releasedUsd = milestones.filter(m => m.status === "released").reduce((s, m) => s + (m.amountUsd ?? 0), 0);
      lines.push(`## Milestones (${milestones.length}) — $${releasedUsd.toLocaleString()} released / $${totalUsd.toLocaleString()} total`);
      for (const m of milestones) lines.push(`- [${m.status}] ${m.title}${m.amountUsd ? ` — $${m.amountUsd.toLocaleString()}` : ""}`);
      lines.push(``);
    }
    if (tickets.length > 0) {
      const done = tickets.filter(t => t.status === "done").length;
      lines.push(`## Tickets (${done}/${tickets.length} done)`);
      for (const t of tickets) lines.push(`- [${t.status}] ${t.title}${t.estimatedHours ? ` (${t.estimatedHours}h)` : ""}`);
      lines.push(``);
    }
    if (nda) {
      lines.push(`## NDA`);
      lines.push(`Status: ${nda.status} | Signed by ${nda.signedBy.length} parties`);
      lines.push(``);
    }
    if (room.notes) {
      lines.push(`## Notes`);
      lines.push(room.notes);
      lines.push(``);
    }
    res.json({ filename: `${room.roomCode}_export.md`, content: lines.join("\n") });
  } catch (err) {
    req.log.error({ err }, "exportRoom error");
    res.status(500).json({ error: "Failed to export room" });
  }
});

router.delete("/:id/participants/:participantId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (String(room.businessId) !== req.userId) { res.status(403).json({ error: "Only the room owner can remove participants" }); return; }
    await RoomParticipant.findByIdAndDelete(req.params["participantId"]);
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:participant_removed", { roomId: req.params["id"], participantId: req.params["participantId"] });
    RoomActivity.create({ roomId: String(req.params["id"]), type: "participant_removed", actorId: req.userId }).catch(() => {});
    res.json({ message: "Participant removed" });
  } catch (err) {
    req.log.error({ err }, "removeParticipant error");
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

router.put("/:id/notes", requireAuth, async (req: AuthRequest, res) => {
  const { notes } = req.body;
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { notes: notes ?? null },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:notes_updated", { roomId: req.params["id"], notes: room.notes });
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "saveNotes error");
    res.status(500).json({ error: "Failed to save notes" });
  }
});

router.put("/:id/meet-link", requireAuth, async (req: AuthRequest, res) => {
  const { meetLink } = req.body;
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { meetLink: meetLink ?? null },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:meet_link_updated", { roomId: req.params["id"], meetLink });
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "saveMeetLink error");
    res.status(500).json({ error: "Failed to save meet link" });
  }
});

router.get("/:id/activity", requireAuth, async (req: AuthRequest, res) => {
  try {
    const activities = await RoomActivity.find({ roomId: req.params["id"] })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(activities.map((a) => ({
      _id: a._id,
      type: a.type,
      actorId: a.actorId ?? null,
      actorName: a.actorName ?? null,
      meta: a.meta ?? {},
      createdAt: a.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "getActivity error");
    res.status(500).json({ error: "Failed to get activity" });
  }
});

router.put("/:id/brief", requireAuth, async (req: AuthRequest, res) => {
  const { brief } = req.body;
  if (!brief) { res.status(400).json({ error: "brief required" }); return; }
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { aiScopedBrief: brief, status: "matching" },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    RoomActivity.create({ roomId: String(req.params["id"]), type: "brief_generated", actorId: req.userId }).catch(() => {});
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "saveBrief error");
    res.status(500).json({ error: "Failed to save brief" });
  }
});

router.put("/:id/status", requireAuth, async (req: AuthRequest, res) => {
  const allowed = ["scoping", "matching", "open", "assembling", "contracted", "closed"];
  const { status } = req.body;
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  try {
    const room = await LiveRoom.findByIdAndUpdate(req.params["id"], { status }, { new: true });
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:status_changed", { roomId: req.params["id"], status });
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "updateRoomStatus error");
    res.status(500).json({ error: "Failed to update room status" });
  }
});

router.post("/:id/participants", requireAuth, async (req: AuthRequest, res) => {
  const { userId, roleId } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  try {
    const roomId = String(req.params["id"]);
    const room = await LiveRoom.findById(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const existing = await RoomParticipant.findOne({ roomId, userId });
    if (existing) {
      res.status(409).json({ error: "Talent is already in this room" });
      return;
    }
    const participant = await RoomParticipant.create({
      roomId,
      userId,
      roleId: roleId ?? undefined,
      status: "invited",
    });
    const io = getIo();
    if (io) io.to(`room:${roomId}`).emit("room:participant_invited", { roomId, userId });
    res.status(201).json(formatParticipant(participant));
  } catch (err) {
    req.log.error({ err }, "inviteParticipant error");
    res.status(500).json({ error: "Failed to invite talent" });
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
    notes: room.notes ?? null,
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
