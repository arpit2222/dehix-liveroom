import { Router } from "express";
import { nanoid } from "nanoid";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { RoomChannel } from "../models/RoomChannel.js";
import { RoomMessage } from "../models/RoomMessage.js";
import { RoomDocumentPermission } from "../models/RoomDocumentPermission.js";
import { FreelancerMatch } from "../models/FreelancerMatch.js";
import { ProjectShortlist } from "../models/ProjectShortlist.js";
import { ProjectEnquiry } from "../models/ProjectEnquiry.js";
import { ProjectEnquiryRecipient } from "../models/ProjectEnquiryRecipient.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { Ticket } from "../models/Ticket.js";
import { Milestone } from "../models/Milestone.js";
import { Nda } from "../models/Nda.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { CreateRoomBody, InviteTalentBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";
import {
  getOrCreateBusinessBlueprintPdf,
  getOrCreateBusinessValidationPdf,
} from "../lib/reportPdfCache.js";
import {
  buildBusinessBlueprintPdf,
  buildBusinessValidationPdf,
  buildExecutiveSummaryPdf,
  buildMvpScopePdf,
  buildTechnicalArchitecturePdf,
  buildFreelancerHiringBriefPdf,
  buildRoadmapBudgetPdf,
} from "../lib/reportPdf.js";

// Imports for ZIP support
import JSZip from "jszip";
import { GeneratedDoc } from "../models/GeneratedDoc.js";
import { AiChatMessage } from "../models/AiChatMessage.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { azureOpenai, azureOpenAiDeployment, isAiProviderEnabled } from "../lib/openai.js";
import { TECH_MANDATORY_QUESTIONS } from "../lib/launchQuestions.js";
import { requireRoomAccess, requireRoomOwner } from "../lib/roomAccess.js";
import { calculateRoomFreelancerMatches } from "../lib/freelancerLinking.js";
import { RoomInviteError, inviteTalentToRoom } from "../lib/roomInvites.js";
import {
  STANDARD_ROOM_DOCUMENTS,
  createTalentJoinedSystemMessage,
  ensureDirectChannelForParticipant,
  ensureInterviewChannelForParticipants,
  ensureGeneralChannel,
  ensureWorkspaceChannels,
  formatRoomChannel,
  formatRoomMessage,
  getPermissionMatrix,
  getRoomDocumentCatalog,
  getVisibleChannels,
  isRoomOwner,
  userCanAccessChannel,
  userCanViewRoomDocument,
} from "../lib/roomWorkspace.js";

const router = Router();

function generateMeetLink(roomCode: string): string {
  return `https://meet.google.com/new`;
}

function originalIdeaFromRoom(room: InstanceType<typeof LiveRoom>): string | undefined {
  const match = room.rawDescription.match(/^Original Idea:\n([\s\S]*?)(?:\n\nBusiness Validation:|$)/);
  return match?.[1]?.trim();
}

async function findLaunchSessionForRoom(room: InstanceType<typeof LiveRoom>) {
  if (room.launchSessionId) {
    const session = await LaunchSession.findOne({ _id: room.launchSessionId, userId: room.businessId });
    if (session) return session;
  }

  const brief = room.aiScopedBrief as any;
  if (brief?.launchSessionId) {
    const session = await LaunchSession.findOne({ _id: brief.launchSessionId, userId: room.businessId });
    if (session) return session;
  }

  const rawIdea = originalIdeaFromRoom(room);
  if (!rawIdea) return null;
  return LaunchSession.findOne({ userId: room.businessId, rawIdea }).sort({ createdAt: -1 });
}

function normalizeLookup(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseCommandText(commandText: unknown) {
  const raw = typeof commandText === "string" ? commandText.trim() : "";
  const match = raw.match(/^\/([a-z0-9_-]+)\b/i);
  if (!match) return { action: "", args: "", raw };
  return {
    action: match[1]!.toLowerCase(),
    args: raw.slice(match[0].length).trim(),
    raw,
  };
}

function extractCommandTargetQueries(args: string): string[] {
  if (!args.includes("@")) return [];
  return args
    .split("@")
    .slice(1)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .map((part) => part.replace(/\s+(as|for|role|with|and)\s.*$/i, "").trim())
    .filter(Boolean);
}

function commandHelpSummary() {
  return [
    "Available commands:",
    "/interview @name - create or open an interview channel",
    "/interview @name @name2 - create or open a multi-talent interview channel",
    "/meet - create an instant Meet link inside an interview channel",
    "/hire @name - mark a talent as hired after confirmation",
    "/remove @name - remove a talent after confirmation",
    "/help - show this command list",
  ].join("\n");
}

async function postSystemMessage(room: InstanceType<typeof LiveRoom>, message: string, channelId?: unknown) {
  const channel = channelId
    ? await RoomChannel.findOne({ _id: channelId, roomId: room._id })
    : await ensureGeneralChannel(room._id);
  if (!channel) return null;
  const saved = await RoomMessage.create({
    roomId: room._id,
    channelId: channel._id,
    senderName: "System",
    type: "system",
    message,
    mentions: [],
  });
  emitChannelMessage(getIo(), room, channel, saved);
  return saved;
}

async function notifyTalent({
  room,
  talentId,
  title,
  message,
  event,
  payload,
}: {
  room: InstanceType<typeof LiveRoom>;
  talentId: string | InstanceType<typeof RoomParticipant>["userId"];
  title: string;
  message: string;
  event: string;
  payload?: Record<string, unknown>;
}) {
  await Notification.create({
    userId: talentId,
    type: "system",
    title,
    message,
    roomId: room._id,
  });
  getIo()?.to(`talent:${String(talentId)}`).emit(event, {
    roomId: String(room._id),
    title,
    message,
    ...(payload ?? {}),
  });
}

async function notifyMentionedTalents(
  room: InstanceType<typeof LiveRoom>,
  messageText: string,
  senderId: string,
  message: InstanceType<typeof RoomMessage>
) {
  const lowerMessage = messageText.toLowerCase();
  if (!lowerMessage.includes("@")) return;
  const participants = await RoomParticipant.find({
    roomId: room._id,
    userId: { $ne: senderId },
    status: { $in: ["joined", "accepted"] },
  }).populate("userId", "name email");
  const notified = new Set<string>();
  for (const participant of participants as any[]) {
    const user = participant.userId;
    const name = String(user?.name ?? "");
    const email = String(user?.email ?? "");
    const emailPrefix = email.split("@")[0] ?? "";
    const terms = [name, name.split(/\s+/)[0], emailPrefix]
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 1 && term !== "dehixai");
    const mentioned = terms.some((term) => lowerMessage.includes(`@${term}`));
    const talentId = String(user?._id ?? participant.userId);
    if (!mentioned || notified.has(talentId)) continue;
    notified.add(talentId);
    await notifyTalent({
      room,
      talentId,
      title: "You were mentioned",
      message: `${room.title}: ${message.senderName} mentioned you in General.`,
      event: "talent:mentioned",
      payload: { channelId: String(message.channelId), messageId: String(message._id) },
    });
  }
}

async function notifyInterviewParticipants(
  room: InstanceType<typeof LiveRoom>,
  channel: InstanceType<typeof RoomChannel>,
  title: string,
  message: string,
  event: string
) {
  const talentIds = channel.participantIds.map(String).filter((id) => id !== String(room.businessId));
  await Promise.all(talentIds.map((talentId) =>
    notifyTalent({
      room,
      talentId,
      title,
      message,
      event,
      payload: { channelId: String(channel._id) },
    })
  ));
}

async function resolveCommandTargets(roomId: string, queries: string[]) {
  const participants = await RoomParticipant.find({ roomId, status: { $in: ["invited", "joined", "accepted"] } })
    .populate("userId", "name email avatarUrl");
  const formatted = participants.map((participant: any) => {
    const user = participant.userId;
    return {
      participant,
      participantId: String(participant._id),
      talentId: String(user?._id ?? participant.userId),
      name: user?.name ?? "Talent",
      email: user?.email ?? "",
      status: participant.status,
      roleId: participant.roleId ?? null,
    };
  });

  const resolved: any[] = [];
  const ambiguous: any[] = [];
  const missing: string[] = [];

  for (const query of queries) {
    const normalizedQuery = normalizeLookup(query);
    const matches = formatted.filter((candidate) => {
      const name = normalizeLookup(candidate.name);
      const email = normalizeLookup(candidate.email);
      const emailPrefix = normalizeLookup(String(candidate.email).split("@")[0]);
      return (
        name === normalizedQuery ||
        email === normalizedQuery ||
        emailPrefix === normalizedQuery ||
        name.includes(normalizedQuery) ||
        normalizedQuery.includes(name) ||
        emailPrefix.includes(normalizedQuery)
      );
    });
    const exact = matches.filter((candidate) => {
      const name = normalizeLookup(candidate.name);
      const email = normalizeLookup(candidate.email);
      const emailPrefix = normalizeLookup(String(candidate.email).split("@")[0]);
      return name === normalizedQuery || email === normalizedQuery || emailPrefix === normalizedQuery;
    });
    const candidates = exact.length > 0 ? exact : matches;
    if (candidates.length === 0) {
      missing.push(query);
    } else if (candidates.length > 1) {
      ambiguous.push({
        query,
        candidates: candidates.map(({ participant, ...candidate }) => candidate),
      });
    } else {
      resolved.push(candidates[0]);
    }
  }

  return { resolved, ambiguous, missing };
}

async function createOrOpenInterviewChannel({
  room,
  participantIds,
  title,
  roleId,
}: {
  room: InstanceType<typeof LiveRoom>;
  participantIds: string[];
  title?: string;
  roleId?: string | null;
}) {
  const participants = await RoomParticipant.find({
    _id: { $in: participantIds },
    roomId: room._id,
    status: { $in: ["joined", "accepted"] },
  });
  if (participants.length === 0) return null;
  const channel = await ensureInterviewChannelForParticipants({ room, participants, title, roleId });
  if (!channel) return null;
  const users = await User.find({ _id: { $in: participants.map((participant) => participant.userId) } }).select("name");
  const names = users.map((user) => user.name).filter(Boolean);
  await postSystemMessage(room, `Interview channel created for ${names.join(", ") || "selected talent"}`);
  const io = getIo();
  io?.to(`room:${room._id}`).emit("room:channel_created", formatRoomChannel(channel));
  io?.to(`room:${room._id}`).emit("room:interview_created", { roomId: room._id, channel: formatRoomChannel(channel) });
  await Promise.all(participants.map((participant) =>
    notifyTalent({
      room,
      talentId: participant.userId,
      title: "Interview channel created",
      message: `${room.title}: an interview channel is ready for you.`,
      event: "talent:interview_created",
      payload: { channelId: String(channel._id) },
    })
  ));
  return channel;
}

async function markTalentHired(room: InstanceType<typeof LiveRoom>, target: any, actorId: string) {
  const participant = await RoomParticipant.findOneAndUpdate(
    { _id: target.participantId, roomId: room._id },
    { status: "accepted" },
    { new: true }
  );
  if (!participant) return null;
  if (participant.roleId) {
    await RoomRole.findOneAndUpdate(
      { _id: participant.roleId, roomId: room._id },
      { filledBy: participant.userId, status: "filled" }
    );
    await FreelancerMatch.findOneAndUpdate(
      { roomId: room._id, freelancerId: participant.userId, roleId: participant.roleId },
      { status: "hired" }
    );
    const role = await RoomRole.findById(participant.roleId);
    await ProjectShortlist.findOneAndUpdate(
      { roomId: room._id, freelancerId: participant.userId, roleId: participant.roleId },
      {
        roomId: room._id,
        businessId: actorId,
        freelancerId: participant.userId,
        roleId: participant.roleId,
        role: role?.roleTitle ?? "Project role",
        status: "hired",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const directChannel = await ensureDirectChannelForParticipant(room, participant);
  const io = getIo();
  if (directChannel && io) io.to(`room:${room._id}`).emit("room:channel_created", formatRoomChannel(directChannel));
  io?.to(`room:${room._id}`).emit("room:participant_joined", { roomId: room._id, userId: participant.userId, status: "accepted" });
  io?.to(`talent:${String(participant.userId)}`).emit("talent:hired", { roomId: room._id, roleId: participant.roleId ?? null });
  await postSystemMessage(room, `${target.name} was marked as hired`);
  await notifyTalent({
    room,
    talentId: participant.userId,
    title: "You were hired",
    message: `${room.title}: the business marked you as hired.`,
    event: "talent:hired",
    payload: { roleId: participant.roleId ?? null },
  });
  RoomActivity.create({
    roomId: room._id,
    type: "freelancer_hired",
    actorId,
    meta: { freelancerId: participant.userId, source: "slash_command" },
  }).catch(() => {});
  return participant;
}

async function removeTalentFromRoom(room: InstanceType<typeof LiveRoom>, target: any, actorId: string) {
  const deleted = await RoomParticipant.findOneAndDelete({ _id: target.participantId, roomId: room._id });
  if (!deleted) return null;
  await RoomChannel.updateMany(
    { roomId: room._id, participantIds: deleted.userId },
    { $pull: { participantIds: deleted.userId } }
  );
  const io = getIo();
  io?.to(`room:${room._id}`).emit("room:participant_removed", { roomId: room._id, participantId: target.participantId });
  await postSystemMessage(room, `${target.name} was removed from the room`);
  await notifyTalent({
    room,
    talentId: deleted.userId,
    title: "Removed from room",
    message: `${room.title}: your access to the room was removed.`,
    event: "talent:removed",
  });
  RoomActivity.create({ roomId: room._id, type: "participant_removed", actorId }).catch(() => {});
  return deleted;
}

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  if (req.userRole !== "business") {
    res.status(403).json({ error: "Only business accounts can create rooms" });
    return;
  }

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
    RoomActivity.create({ roomId: room._id, type: "room_created", actorId: req.userId, meta: { title } }).catch(() => { });
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
    if (String(room.businessId) === req.userId) {
      await ensureWorkspaceChannels(room);
      res.json({ room: formatRoom(room), alreadyJoined: true });
      return;
    }
    const existing = await RoomParticipant.findOne({ roomId: room._id, userId: req.userId });
    if (!existing) {
      res.status(403).json({ error: "Only invited talent can join this live room" });
      return;
    }
    if (existing.status === "joined" || existing.status === "accepted") {
      await ensureDirectChannelForParticipant(room, existing);
      res.json({ room: formatRoom(room), alreadyJoined: true });
      return;
    }
    if (existing.status !== "invited") {
      res.status(403).json({ error: "This invite is not active" });
      return;
    }
    existing.status = "joined";
    existing.joinedAt = new Date();
    await existing.save();
    const directChannel = await ensureDirectChannelForParticipant(room, existing);
    const io = getIo();
    if (directChannel && io) {
      io.to(`room:${room._id}`).emit("room:channel_created", formatRoomChannel(directChannel));
    }
    await createTalentJoinedSystemMessage(room, existing, io);
    if (io) io.to(`room:${room._id}`).emit("room:participant_joined", { roomId: room._id, userId: req.userId, status: "joined" });
    res.json({ room: formatRoom(room), participant: existing, alreadyJoined: false });
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
      const participations = await RoomParticipant.find({
        userId: req.userId,
        status: { $in: ["joined", "accepted"] },
      }).select("roomId");
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
      ...formatRoomForUser(room, req.userId),
      participantCount: pCountMap.get(String(room._id)) ?? 0,
      ticketStats: tCountMap.get(String(room._id)) ?? { total: 0, done: 0 },
      milestoneStats: mCountMap.get(String(room._id)) ?? { total: 0, totalUsd: 0, releasedUsd: 0 },
    })));
  } catch (err) {
    req.log.error({ err }, "getMyRooms error");
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

router.get("/:id/activity", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const roomId = req.params["id"];
    const storedActivities = await RoomActivity.find({ roomId }).sort({ createdAt: -1 }).limit(50);
    if (storedActivities.length > 0) {
      const labelForActivity = (activity: InstanceType<typeof RoomActivity>) => {
        const title = typeof activity.meta?.title === "string" ? activity.meta.title : "";
        switch (activity.type) {
          case "room_created":
            return title ? `Room created: ${title}` : "Room created";
          case "brief_generated":
            return "AI brief generated from launch context";
          case "nda_generated":
            return "NDA generated from room context";
          case "nda_signed":
            return activity.meta?.fullyExecuted ? "NDA fully signed" : "NDA signature recorded";
          case "milestone_created":
            return title ? `Milestone added: ${title}` : "Milestone added";
          case "milestone_released":
            return title ? `Milestone released: ${title}` : "Milestone released";
          case "ticket_created":
            return title ? `Ticket created: ${title}` : "Ticket created";
          case "participant_joined":
            return "Participant joined";
          case "participant_invited":
            return "Participant invited";
          case "participant_removed":
            return "Participant removed";
          case "notes_updated":
            return "Room notes updated";
          case "freelancer_matches_generated":
            return "Freelancer matches generated";
          case "freelancer_shortlisted":
            return "Freelancer shortlisted";
          case "freelancer_enquiry_sent":
            return "Freelancer enquiry sent";
          case "freelancer_enquiry_responded":
            return "Freelancer responded to enquiry";
          case "freelancer_hired":
            return "Freelancer hired";
          case "room_contracted":
            return "Room contracted";
          case "room_closed":
            return "Room closed";
          default:
            return activity.type.replace(/_/g, " ");
        }
      };
      const iconForActivity = (type: string) => {
        if (type.includes("ticket")) return "T";
        if (type.includes("milestone")) return "M";
        if (type.includes("nda")) return "N";
        if (type.includes("brief")) return "B";
        if (type.includes("participant")) return "P";
        if (type.includes("freelancer")) return "F";
        return "*";
      };
      res.json(storedActivities.map((activity) => ({
        _id: activity._id,
        type: activity.type,
        label: labelForActivity(activity),
        at: activity.createdAt,
        createdAt: activity.createdAt,
        icon: iconForActivity(activity.type),
        actorId: activity.actorId ?? null,
        actorName: activity.actorName ?? null,
        meta: activity.meta ?? {},
      })));
      return;
    }
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

router.get("/:id", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
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
      ...formatRoomForUser(room, req.userId),
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

router.get("/:id/participants", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
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

router.get("/:id/workspace", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    await ensureWorkspaceChannels(room);
    const [roles, participants, tickets, milestones, nda, channels, docCatalog] = await Promise.all([
      RoomRole.find({ roomId: room._id }),
      RoomParticipant.find({ roomId: room._id }).populate("userId", "-password"),
      Ticket.find({ roomId: room._id }),
      Milestone.find({ roomId: room._id }),
      Nda.findOne({ roomId: room._id }),
      getVisibleChannels(room, req.userId!),
      getRoomDocumentCatalog(room, req.userId!),
    ]);
    const currentParticipant = await RoomParticipant.findOne({
      roomId: room._id,
      userId: req.userId,
      status: { $in: ["joined", "accepted"] },
    });
    const permissionMatrix = isRoomOwner(room, req.userId) ? await getPermissionMatrix(room) : [];
    const displayChannels = await formatWorkspaceChannels(room, channels, req.userId!);
    res.json({
      room: formatRoomForUser(room, req.userId),
      roles: roles.map(formatRole),
      participants: participants.map(formatParticipant),
      tickets: tickets.map(formatTicket),
      milestones: milestones.map(formatMilestone),
      nda: nda ? formatNda(nda) : null,
      channels: displayChannels,
      documents: docCatalog,
      permissionMatrix,
      currentUserAccess: {
        isOwner: isRoomOwner(room, req.userId),
        participantId: currentParticipant?._id ?? null,
        status: currentParticipant?.status ?? (isRoomOwner(room, req.userId) ? "owner" : null),
        canManageDocuments: isRoomOwner(room, req.userId),
        canSeeAllChannels: isRoomOwner(room, req.userId),
      },
    });
  } catch (err) {
    req.log.error({ err }, "getWorkspace error");
    res.status(500).json({ error: "Failed to load workspace" });
  }
});

router.get("/:id/channels/:channelId/messages", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    const channel = await RoomChannel.findOne({ _id: req.params["channelId"], roomId: req.params["id"] });
    if (!room || !channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (!(await userCanAccessChannel(room, channel, req.userId))) {
      res.status(403).json({ error: "You do not have access to this channel" });
      return;
    }
    const limit = Math.max(20, Math.min(200, Number(req.query["limit"] ?? 120)));
    const messages = await RoomMessage.find({ roomId: room._id, channelId: channel._id })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(messages.reverse().map(formatRoomMessage));
  } catch (err) {
    req.log.error({ err }, "getChannelMessages error");
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/:id/channels/:channelId/messages", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    const channel = await RoomChannel.findOne({ _id: req.params["channelId"], roomId: req.params["id"] });
    if (!room || !channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    if (!(await userCanAccessChannel(room, channel, req.userId))) {
      res.status(403).json({ error: "You do not have access to this channel" });
      return;
    }
    const messageText = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 6000) : "";
    if (!messageText) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const user = await User.findById(req.userId).select("name");
    const saved = await RoomMessage.create({
      roomId: room._id,
      channelId: channel._id,
      senderId: req.userId,
      senderName: user?.name ?? "User",
      type: "user",
      message: messageText,
      mentions: extractMentions(messageText),
    });
    const io = getIo();
    emitChannelMessage(io, room, channel, saved);
    if (channel.type === "general") {
      await notifyMentionedTalents(room, messageText, req.userId!, saved);
    }
    const aiMessage = messageMentionsDehixAi(messageText)
      ? await createPermissionAwareAiReply(room, channel, req.userId!, messageText, io)
      : null;
    res.status(201).json({
      message: formatRoomMessage(saved),
      aiMessage: aiMessage ? formatRoomMessage(aiMessage) : null,
    });
  } catch (err) {
    req.log.error({ err }, "createChannelMessage error");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/:id/commands/preview", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const channel = await RoomChannel.findOne({ _id: req.body?.channelId, roomId: room._id });
    if (!channel || !(await userCanAccessChannel(room, channel, req.userId))) {
      res.status(403).json({ error: "You do not have access to this channel" });
      return;
    }

    const parsed = parseCommandText(req.body?.commandText);
    if (!parsed.action) {
      res.status(400).json({ error: "Command must start with /" });
      return;
    }

    if (parsed.action === "help") {
      res.json({
        commandId: nanoid(10),
        action: "help",
        summary: commandHelpSummary(),
        targets: [],
        warnings: [],
        requiresConfirmation: false,
        payload: { channelId: String(channel._id) },
      });
      return;
    }

    if (parsed.action === "meet") {
      if (channel.type !== "interview") {
        res.status(400).json({ error: "/meet can only be used inside an interview channel" });
        return;
      }
      res.json({
        commandId: nanoid(10),
        action: "meet",
        summary: "Create an instant Google Meet link for this interview channel.",
        targets: [],
        warnings: [],
        requiresConfirmation: true,
        payload: { channelId: String(channel._id) },
      });
      return;
    }

    if (!isRoomOwner(room, req.userId)) {
      res.status(403).json({ error: "Only the business owner can use this command" });
      return;
    }

    if (!["remove", "hire", "interview"].includes(parsed.action)) {
      res.status(400).json({ error: "Unknown command. Try /help." });
      return;
    }

    const queries = extractCommandTargetQueries(parsed.args);
    if (queries.length === 0) {
      res.status(400).json({ error: "Mention at least one talent with @name" });
      return;
    }
    const resolved = await resolveCommandTargets(String(room._id), queries);
    if (resolved.missing.length > 0 || resolved.ambiguous.length > 0) {
      res.status(409).json({
        error: "Command target needs clarification",
        missing: resolved.missing,
        ambiguous: resolved.ambiguous,
      });
      return;
    }
    if (parsed.action !== "interview" && resolved.resolved.length !== 1) {
      res.status(400).json({ error: `/${parsed.action} expects exactly one talent` });
      return;
    }
    if (parsed.action === "interview" && resolved.resolved.some((target) => !["invited", "joined", "accepted"].includes(target.status))) {
      res.status(400).json({ error: "Interview channels can be created only for invited or active talent" });
      return;
    }

    const targets = resolved.resolved.map(({ participant, ...target }) => target);
    const actionLabel = parsed.action === "hire"
      ? `Mark ${targets[0]?.name} as hired`
      : parsed.action === "remove"
        ? `Remove ${targets[0]?.name} from the room`
        : `Create or open interview channel for ${targets.map((target) => target.name).join(", ")}`;
    res.json({
      commandId: nanoid(10),
      action: parsed.action,
      summary: actionLabel,
      targets,
      warnings: parsed.action === "remove" ? ["This talent will lose access to room channels."] : [],
      requiresConfirmation: true,
      payload: {
        channelId: String(channel._id),
        participantIds: targets.map((target) => target.participantId),
        roleId: targets[0]?.roleId ?? null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "previewCommand error");
    res.status(500).json({ error: "Failed to preview command" });
  }
});

router.post("/:id/commands/execute", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const channel = payload.channelId ? await RoomChannel.findOne({ _id: payload.channelId, roomId: room._id }) : null;

    if (action === "help") {
      res.json({ action, message: commandHelpSummary() });
      return;
    }

    if (action === "meet") {
      if (!channel || channel.type !== "interview" || !(await userCanAccessChannel(room, channel, req.userId))) {
        res.status(403).json({ error: "You do not have access to this interview channel" });
        return;
      }
      const meetLink = generateMeetLink(room.roomCode);
      channel.interviewMeetLink = meetLink;
      channel.interviewStatus = "live";
      await channel.save();
      const message = await postSystemMessage(room, `Instant Meet created: ${meetLink}`, channel._id);
      getIo()?.to(`room:${room._id}`).emit("room:interview_updated", { roomId: room._id, channel: formatRoomChannel(channel) });
      await notifyInterviewParticipants(room, channel, "Interview Meet ready", `${room.title}: an instant Meet is ready.`, "talent:interview_meet");
      res.json({ action, channel: formatRoomChannel(channel), message: message ? formatRoomMessage(message) : null });
      return;
    }

    if (!isRoomOwner(room, req.userId)) {
      res.status(403).json({ error: "Only the business owner can execute this command" });
      return;
    }

    const participantIds = Array.isArray(payload.participantIds)
      ? payload.participantIds.map(String).filter(Boolean)
      : [];
    const participants = participantIds.length > 0
      ? await RoomParticipant.find({ _id: { $in: participantIds }, roomId: room._id }).populate("userId", "name email")
      : [];
    const targets = participants.map((participant: any) => ({
      participantId: String(participant._id),
      talentId: String(participant.userId?._id ?? participant.userId),
      name: participant.userId?.name ?? "Talent",
      email: participant.userId?.email ?? "",
      status: participant.status,
      roleId: participant.roleId ?? null,
    }));

    if (action === "hire") {
      if (targets.length !== 1) {
        res.status(400).json({ error: "/hire expects exactly one talent" });
        return;
      }
      const participant = await markTalentHired(room, targets[0], req.userId!);
      getIo()?.to(`room:${room._id}`).emit("room:command_executed", { roomId: room._id, action });
      res.json({ action, participant: participant ? formatParticipant(participant) : null });
      return;
    }

    if (action === "remove") {
      if (targets.length !== 1) {
        res.status(400).json({ error: "/remove expects exactly one talent" });
        return;
      }
      await removeTalentFromRoom(room, targets[0], req.userId!);
      getIo()?.to(`room:${room._id}`).emit("room:command_executed", { roomId: room._id, action });
      res.json({ action, message: "Talent removed" });
      return;
    }

    if (action === "interview") {
      const channelResult = await createOrOpenInterviewChannel({
        room,
        participantIds,
        roleId: typeof payload.roleId === "string" ? payload.roleId : null,
      });
      if (!channelResult) {
        res.status(400).json({ error: "No invited or active talent selected for interview" });
        return;
      }
      getIo()?.to(`room:${room._id}`).emit("room:command_executed", { roomId: room._id, action });
      res.json({ action, channel: formatRoomChannel(channelResult) });
      return;
    }

    res.status(400).json({ error: "Unknown command" });
  } catch (err) {
    req.log.error({ err }, "executeCommand error");
    res.status(500).json({ error: "Failed to execute command" });
  }
});

router.post("/:id/interviews", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const participantIds = Array.isArray(req.body?.participantIds) ? req.body.participantIds.map(String).filter(Boolean) : [];
    if (participantIds.length === 0) {
      res.status(400).json({ error: "participantIds are required" });
      return;
    }
    const channel = await createOrOpenInterviewChannel({
      room,
      participantIds,
      roleId: typeof req.body?.roleId === "string" ? req.body.roleId : null,
      title: typeof req.body?.title === "string" ? req.body.title : undefined,
    });
    if (!channel) {
      res.status(400).json({ error: "No invited or active talent selected for interview" });
      return;
    }
    res.status(201).json(formatRoomChannel(channel));
  } catch (err) {
    req.log.error({ err }, "createInterviewChannel error");
    res.status(500).json({ error: "Failed to create interview channel" });
  }
});

router.patch("/:id/interviews/:channelId", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const channel = await RoomChannel.findOne({ _id: req.params["channelId"], roomId: req.params["id"], type: "interview" });
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room || !channel) {
      res.status(404).json({ error: "Interview channel not found" });
      return;
    }
    const status = typeof req.body?.status === "string" ? req.body.status : undefined;
    if (status && !["scheduled", "live", "completed", "cancelled"].includes(status)) {
      res.status(400).json({ error: "Invalid interview status" });
      return;
    }
    if (status) channel.interviewStatus = status as any;
    if (typeof req.body?.interviewNotes === "string") channel.interviewNotes = req.body.interviewNotes.slice(0, 8000);
    if (typeof req.body?.interviewScheduledAt === "string" && req.body.interviewScheduledAt) {
      const date = new Date(req.body.interviewScheduledAt);
      if (Number.isNaN(date.getTime())) {
        res.status(400).json({ error: "Invalid interviewScheduledAt" });
        return;
      }
      channel.interviewScheduledAt = date;
    }
    await channel.save();
    if (status === "completed") {
      await postSystemMessage(room, "Interview marked completed", channel._id);
    }
    getIo()?.to(`room:${room._id}`).emit("room:interview_updated", { roomId: room._id, channel: formatRoomChannel(channel) });
    res.json(formatRoomChannel(channel));
  } catch (err) {
    req.log.error({ err }, "updateInterviewChannel error");
    res.status(500).json({ error: "Failed to update interview channel" });
  }
});

router.post("/:id/interviews/:channelId/meet", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    const channel = await RoomChannel.findOne({ _id: req.params["channelId"], roomId: req.params["id"], type: "interview" });
    if (!room || !channel) {
      res.status(404).json({ error: "Interview channel not found" });
      return;
    }
    if (!(await userCanAccessChannel(room, channel, req.userId))) {
      res.status(403).json({ error: "You do not have access to this interview channel" });
      return;
    }
    const meetLink = generateMeetLink(room.roomCode);
    channel.interviewMeetLink = meetLink;
    channel.interviewStatus = "live";
    await channel.save();
    const message = await postSystemMessage(room, `Instant Meet created: ${meetLink}`, channel._id);
    getIo()?.to(`room:${room._id}`).emit("room:interview_updated", { roomId: room._id, channel: formatRoomChannel(channel) });
    await notifyInterviewParticipants(room, channel, "Interview Meet ready", `${room.title}: an instant Meet is ready.`, "talent:interview_meet");
    res.json({ channel: formatRoomChannel(channel), message: message ? formatRoomMessage(message) : null });
  } catch (err) {
    req.log.error({ err }, "createInterviewMeet error");
    res.status(500).json({ error: "Failed to create interview Meet" });
  }
});

router.patch("/:id/document-permissions", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const participantId = typeof req.body?.participantId === "string" ? req.body.participantId : "";
    const talentId = typeof req.body?.talentId === "string" ? req.body.talentId : "";
    const docType = typeof req.body?.docType === "string" ? req.body.docType.trim() : "";
    const canView = Boolean(req.body?.canView);
    if (!docType || (!participantId && !talentId)) {
      res.status(400).json({ error: "participantId or talentId plus docType is required" });
      return;
    }
    const participant = await RoomParticipant.findOne({
      roomId: room._id,
      ...(participantId ? { _id: participantId } : { userId: talentId }),
    });
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const baseSet = {
      roomId: room._id,
      participantId: participant._id,
      talentId: participant.userId,
      docType,
      canView,
      grantedBy: req.userId,
    };
    const saved = await RoomDocumentPermission.findOneAndUpdate(
      { roomId: room._id, talentId: participant.userId, docType },
      canView
        ? { $set: { ...baseSet, grantedAt: new Date() }, $unset: { revokedAt: "" } }
        : { $set: { ...baseSet, revokedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    getIo()?.to(`room:${room._id}`).emit("room:document_permission_updated", {
      roomId: room._id,
      participantId: participant._id,
      talentId: participant.userId,
      docType,
      canView,
    });
    res.json({
      _id: saved._id,
      participantId: saved.participantId,
      talentId: saved.talentId,
      docType: saved.docType,
      canView: saved.canView,
      grantedAt: saved.grantedAt,
      revokedAt: saved.revokedAt ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "updateDocumentPermission error");
    res.status(500).json({ error: "Failed to update document permission" });
  }
});

router.get("/:id/documents/:docType", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const docType = String(req.params["docType"]);
    if (!(await userCanViewRoomDocument(room, req.userId, docType))) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }
    const preview = await buildRoomDocumentPreview(room, docType);
    if (!preview) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(preview);
  } catch (err) {
    req.log.error({ err }, "getRoomDocumentPreview error");
    res.status(500).json({ error: "Failed to load document" });
  }
});

router.get("/:id/documents/:docType/pdf", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const docType = String(req.params["docType"]);
    if (!(await userCanViewRoomDocument(room, req.userId, docType))) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }
    const built = await buildStandardRoomDocumentPdf(room, docType);
    if (!built) {
      res.status(404).json({ error: "Document is not available" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${built.filename}"`);
    res.send(built.buffer);
  } catch (err) {
    req.log.error({ err }, "downloadRoomDocumentPdf error");
    res.status(500).json({ error: "Failed to download document PDF" });
  }
});

router.post("/:id/freelancer-matches", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const topK = clampTopK(req.body?.topK);
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const roles = await RoomRole.find({ roomId: room._id });
    if (roles.length === 0) {
      res.status(400).json({ error: "No required roles found for this room" });
      return;
    }

    const candidates = await calculateRoomFreelancerMatches(room, roles, topK);
    await FreelancerMatch.deleteMany({ roomId: room._id });
    if (candidates.length > 0) {
      await FreelancerMatch.insertMany(candidates.map((candidate) => ({ ...candidate, status: "recommended" })));
    }

    const saved = await FreelancerMatch.find({ roomId: room._id })
      .populate("freelancerId", "-password")
      .sort({ role: 1, matchScore: -1 });
    const io = getIo();
    if (io) {
      io.to(`room:${roomId}`).emit("room:freelancer_matches_generated", { roomId, matchCount: saved.length });
    }
    RoomActivity.create({
      roomId: room._id,
      type: "freelancer_matches_generated",
      actorId: req.userId,
      meta: { matchCount: saved.length, roleCount: roles.length },
    }).catch(() => {});

    res.json({
      roomId,
      recommendedTeam: buildRecommendedTeam(roles, saved),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "generateFreelancerMatches error");
    res.status(500).json({ error: "Failed to generate freelancer matches" });
  }
});

router.get("/:id/freelancer-matches", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const roles = await RoomRole.find({ roomId });
    const matches = await FreelancerMatch.find({ roomId })
      .populate("freelancerId", "-password")
      .sort({ role: 1, matchScore: -1 });
    res.json({ roomId, recommendedTeam: buildRecommendedTeam(roles, matches) });
  } catch (err) {
    req.log.error({ err }, "getFreelancerMatches error");
    res.status(500).json({ error: "Failed to get freelancer matches" });
  }
});

router.post("/:id/shortlist", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const { freelancerId, roleId, role } = req.body ?? {};
    if (!freelancerId) {
      res.status(400).json({ error: "freelancerId is required" });
      return;
    }
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const resolvedRole = await resolveRoomRole(roomId, roleId, role);
    if (!resolvedRole) {
      res.status(400).json({ error: "Role does not belong to this room" });
      return;
    }

    const shortlist = await ProjectShortlist.findOneAndUpdate(
      { roomId, freelancerId, roleId: resolvedRole._id },
      {
        roomId,
        businessId: req.userId,
        freelancerId,
        roleId: resolvedRole._id,
        role: resolvedRole.roleTitle,
        status: "shortlisted",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await FreelancerMatch.findOneAndUpdate(
      { roomId, freelancerId, roleId: resolvedRole._id },
      { status: "shortlisted" }
    );
    RoomActivity.create({
      roomId,
      type: "freelancer_shortlisted",
      actorId: req.userId,
      meta: { freelancerId, role: resolvedRole.roleTitle },
    }).catch(() => {});
    res.json({ success: true, status: shortlist.status });
  } catch (err) {
    req.log.error({ err }, "shortlistFreelancer error");
    res.status(500).json({ error: "Failed to shortlist freelancer" });
  }
});

router.delete("/:id/shortlist/:freelancerId", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const roleId = typeof req.query["roleId"] === "string" ? req.query["roleId"] : undefined;
    const filter: Record<string, any> = { roomId, freelancerId: req.params["freelancerId"] };
    if (roleId) filter.roleId = roleId;
    await ProjectShortlist.updateMany(filter, { status: "removed" });
    await FreelancerMatch.updateMany(filter, { status: "recommended" });
    res.json({ success: true, status: "removed" });
  } catch (err) {
    req.log.error({ err }, "removeShortlistFreelancer error");
    res.status(500).json({ error: "Failed to remove shortlisted freelancer" });
  }
});

router.post("/:id/enquiries/top-freelancers", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const topK = clampTopK(req.body?.topK);
    const message = cleanMessage(req.body?.message);
    const sendEmailToOffline = req.body?.sendEmailToOffline !== false;
    const roles = await RoomRole.find({ roomId });
    const selectedMatches: any[] = [];
    for (const role of roles) {
      const roleMatches = await FreelancerMatch.find({ roomId, roleId: role._id })
        .populate("freelancerId", "-password")
        .sort({ matchScore: -1 })
        .limit(topK);
      selectedMatches.push(...roleMatches);
    }
    if (selectedMatches.length === 0) {
      res.status(400).json({ error: "Generate freelancer matches before sending enquiries" });
      return;
    }
    const payload = await sendProjectEnquiry({
      roomId,
      businessId: req.userId!,
      message,
      sendEmailToOffline,
      matches: selectedMatches,
      log: req.log,
    });
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "sendTopFreelancerEnquiry error");
    res.status(500).json({ error: "Failed to send enquiries" });
  }
});

router.post("/:id/enquiries/selected-freelancers", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const freelancers = Array.isArray(req.body?.freelancers) ? req.body.freelancers : [];
    const message = cleanMessage(req.body?.message);
    const sendEmailToOffline = req.body?.sendEmailToOffline !== false;
    if (freelancers.length === 0) {
      res.status(400).json({ error: "Select at least one freelancer" });
      return;
    }

    const matchFilters = [];
    for (const item of freelancers) {
      if (!item?.freelancerId) continue;
      const role = await resolveRoomRole(roomId, item.roleId, item.role);
      if (!role) continue;
      matchFilters.push({ freelancerId: item.freelancerId, roleId: role._id });
    }
    if (matchFilters.length === 0) {
      res.status(400).json({ error: "No valid selected freelancers found" });
      return;
    }

    const matches = await FreelancerMatch.find({ roomId, $or: matchFilters })
      .populate("freelancerId", "-password")
      .sort({ matchScore: -1 });
    if (matches.length === 0) {
      res.status(400).json({ error: "Selected freelancers do not have saved matches yet" });
      return;
    }

    const payload = await sendProjectEnquiry({
      roomId,
      businessId: req.userId!,
      message,
      sendEmailToOffline,
      matches,
      log: req.log,
    });
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "sendSelectedFreelancerEnquiry error");
    res.status(500).json({ error: "Failed to send selected freelancer enquiries" });
  }
});

router.get("/:id/enquiries", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const recipients = await ProjectEnquiryRecipient.find({ roomId })
      .populate("freelancerId", "-password")
      .sort({ createdAt: -1 });
    const enquiryIds = [...new Set(recipients.map((recipient) => String(recipient.enquiryId)))];
    const enquiries = await ProjectEnquiry.find({ _id: { $in: enquiryIds } });
    const enquiryById = new Map(enquiries.map((enquiry) => [String(enquiry._id), enquiry]));
    res.json({
      roomId,
      enquiries: recipients.map((recipient) => formatEnquiryRecipient(recipient, enquiryById.get(String(recipient.enquiryId)))),
    });
  } catch (err) {
    req.log.error({ err }, "getRoomEnquiries error");
    res.status(500).json({ error: "Failed to get enquiry status" });
  }
});

router.post("/:id/hire", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const { freelancerId, roleId, role, agreedAmount, startDate } = req.body ?? {};
    if (!freelancerId) {
      res.status(400).json({ error: "freelancerId is required" });
      return;
    }
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const resolvedRole = await resolveRoomRole(roomId, roleId, role);
    if (!resolvedRole) {
      res.status(400).json({ error: "Role does not belong to this room" });
      return;
    }

    const participant = await RoomParticipant.findOneAndUpdate(
      { roomId, userId: freelancerId },
      { roomId, userId: freelancerId, roleId: resolvedRole._id, status: "accepted" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await RoomRole.findOneAndUpdate(
      { _id: resolvedRole._id, roomId },
      { filledBy: freelancerId, status: "filled" }
    );
    await FreelancerMatch.findOneAndUpdate(
      { roomId, freelancerId, roleId: resolvedRole._id },
      { status: "hired" }
    );
    await ProjectShortlist.findOneAndUpdate(
      { roomId, freelancerId, roleId: resolvedRole._id },
      {
        roomId,
        businessId: req.userId,
        freelancerId,
        roleId: resolvedRole._id,
        role: resolvedRole.roleTitle,
        status: "hired",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const io = getIo();
    const directChannel = await ensureDirectChannelForParticipant(room, participant);
    if (directChannel && io) {
      io.to(`room:${roomId}`).emit("room:channel_created", formatRoomChannel(directChannel));
    }
    await createTalentJoinedSystemMessage(room, participant, io);
    if (io) {
      io.to(`room:${roomId}`).emit("room:participant_joined", { roomId, userId: freelancerId, status: "accepted" });
      io.to(`talent:${freelancerId}`).emit("talent:hired", { roomId, roleId: resolvedRole._id });
    }
    RoomActivity.create({
      roomId,
      type: "freelancer_hired",
      actorId: req.userId,
      meta: { freelancerId, role: resolvedRole.roleTitle, agreedAmount, startDate },
    }).catch(() => {});
    res.json({ success: true, status: "hired", participant: formatParticipant(participant) });
  } catch (err) {
    req.log.error({ err }, "hireFreelancer error");
    res.status(500).json({ error: "Failed to hire freelancer" });
  }
});

router.post("/:id/invite", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  const parsed = InviteTalentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { talentId, roleId } = parsed.data;
  try {
    const roomId = String(req.params["id"]);
    const result = await inviteTalentToRoom({ roomId, talentId, roleId });
    res.status(result.created ? 201 : 200).json({
      message: getInviteResultMessage(result),
      participant: formatParticipant(result.participant),
    });
  } catch (err) {
    if (err instanceof RoomInviteError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "inviteTalent error");
    res.status(500).json({ error: "Failed to invite talent" });
  }
});

router.post("/:id/contract", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { status: "contracted", contractedAt: new Date() },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:status_changed", { roomId: req.params["id"], status: "contracted" });
    RoomActivity.create({ roomId: String(req.params["id"]), type: "room_contracted", actorId: req.userId }).catch(() => { });
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "contractRoom error");
    res.status(500).json({ error: "Failed to contract room" });
  }
});

router.post("/:id/assemble", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
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

router.post("/:id/close", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    await LiveRoom.findByIdAndUpdate(req.params["id"], { status: "closed" });
    RoomActivity.create({ roomId: String(req.params["id"]), type: "room_closed", actorId: req.userId }).catch(() => { });
    res.json({ message: "Room closed" });
  } catch (err) {
    req.log.error({ err }, "closeRoom error");
    res.status(500).json({ error: "Failed to close room" });
  }
});

router.delete("/:id", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const roomId = String(req.params["id"]);
    const room = await LiveRoom.findOne({ _id: roomId, businessId: req.userId });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const io = getIo();
    io?.to(`room:${roomId}`).emit("room:deleted", { roomId });

    await Promise.all([
      RoomRole.deleteMany({ roomId: room._id }),
      RoomParticipant.deleteMany({ roomId: room._id }),
      RoomChannel.deleteMany({ roomId: room._id }),
      RoomMessage.deleteMany({ roomId: room._id }),
      RoomDocumentPermission.deleteMany({ roomId: room._id }),
      Ticket.deleteMany({ roomId: room._id }),
      Milestone.deleteMany({ roomId: room._id }),
      Nda.deleteMany({ roomId: room._id }),
      FreelancerMatch.deleteMany({ roomId: room._id }),
      ProjectShortlist.deleteMany({ roomId: room._id }),
      ProjectEnquiry.deleteMany({ roomId: room._id }),
      ProjectEnquiryRecipient.deleteMany({ roomId: room._id }),
      Notification.deleteMany({ roomId: room._id }),
      GeneratedDoc.deleteMany({ roomId: room._id }),
      AiChatMessage.deleteMany({ roomId: room._id }),
      RoomActivity.deleteMany({ roomId: room._id }),
    ]);
    await LiveRoom.deleteOne({ _id: room._id });

    res.json({ message: "Room deleted" });
  } catch (err) {
    req.log.error({ err }, "deleteRoom error");
    res.status(500).json({ error: "Failed to delete room" });
  }
});

router.get("/:id/business-validation.pdf", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (!(await userCanViewRoomDocument(room, req.userId, "business_validation"))) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }

    const built = await buildStandardRoomDocumentPdf(room, "business_validation");
    if (!built) {
      res.status(404).json({ error: "Validation report is not available for this room" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${room.roomCode}-business-validation.pdf"`);
    res.send(built.buffer);
  } catch (err) {
    req.log.error({ err }, "downloadRoomBusinessValidationPdf error");
    res.status(500).json({ error: "Failed to download business validation PDF" });
  }
});

router.get("/:id/business-blueprint.pdf", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (!(await userCanViewRoomDocument(room, req.userId, "business_blueprint"))) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }

    const built = await buildStandardRoomDocumentPdf(room, "business_blueprint");
    if (!built) {
      res.status(404).json({ error: "Blueprint report is not available for this room" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${room.roomCode}-business-blueprint.pdf"`);
    res.send(built.buffer);
  } catch (err) {
    req.log.error({ err }, "downloadRoomBusinessBlueprintPdf error");
    res.status(500).json({ error: "Failed to download business blueprint PDF" });
  }
});

const DOC_TYPE_LABELS: Record<string, string> = {
  pitch_deck: "Pitch Deck",
  technical_deck: "Technical Deck",
  bd_strategy: "BD Strategy",
  sow: "Statement of Work",
  project_brief: "Project Brief",
  idea_validation_report: "Idea Validation Report",
  business_requirement_document: "Business Requirement Document",
  project_requirement_document: "Project Requirement Document",
  mvp_scope_document: "MVP Scope Document",
  technical_architecture_document: "Technical Architecture Document",
  feature_list_document: "Feature List Document",
  development_roadmap: "Development Roadmap",
};

function safeJson(value: unknown, maxLength = 6000): string {
  if (value === null || value === undefined) return "Not available";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[trimmed for AI context]`;
}

async function buildLaunchContext(session: any): Promise<string> {
  if (!session) return "No launch session context available.";

  const clarifications = await LaunchClarification.find({ sessionId: session._id }).sort({ orderIndex: 1 });
  const technicalAnswersText = session.technicalAnswersText ?? "";
  const mandatoryQuestionContext = TECH_MANDATORY_QUESTIONS
    .map((question, index) => {
      const answered = technicalAnswersText.includes(`Q: ${question.question}\nA:`);
      return `${index + 1}. ${question.question}\nRequired: yes\nAnswer status: ${answered ? "answered in saved technical Q&A below" : "not answered yet or not saved yet"}`;
    })
    .join("\n\n");
  const qa = clarifications
    .map((item) => `Q: ${item.question}\nA: ${item.answer ?? "Not answered"}`)
    .join("\n\n");

  return [
    `Launch session id: ${String(session._id)}`,
    `Original user idea:\n${session.rawIdea}`,
    `Project title: ${session.projectTitle ?? "Not available"}`,
    `Phase 1 business validation JSON:\n${safeJson(session.researchText, 9000)}`,
    `Phase 2 business/development blueprint JSON:\n${safeJson(session.technicalDocText, 9000)}`,
    `Phase 2 mandatory questions:\n${mandatoryQuestionContext}`,
    `Mandatory and optional technical Q&A submitted by the user:\n${session.technicalAnswersText || "No mandatory/optional technical answers saved yet."}`,
    `Talent recommendation report JSON:\n${safeJson(session.businessDocText, 5000)}`,
    `Dynamic optional question records:\n${qa || "No optional question records saved yet."}`,
  ].join("\n\n");
}

async function buildRoomContext(room: any): Promise<string> {
  if (!room) return "No live room context available yet.";

  const [roles, participants, tickets, milestones, nda] = await Promise.all([
    RoomRole.find({ roomId: room._id }),
    RoomParticipant.find({ roomId: room._id }).populate("userId", "name email role"),
    Ticket.find({ roomId: room._id }),
    Milestone.find({ roomId: room._id }),
    Nda.findOne({ roomId: room._id }),
  ]);

  return [
    `Room id: ${String(room._id)}`,
    `Room title: ${room.title}`,
    `Room code: ${room.roomCode}`,
    `Room status: ${room.status}`,
    `Raw room description:\n${room.rawDescription}`,
    `Room notes:\n${room.notes ?? "No notes yet."}`,
    `AI scoped brief JSON:\n${safeJson(room.aiScopedBrief, 10000)}`,
    `Roles:\n${safeJson(roles.map((role) => ({
      title: role.roleTitle,
      skillDomain: role.skillDomain,
      requiredLevel: role.requiredLevel,
      minReputation: role.minReputation,
      status: role.status,
    })), 5000)}`,
    `Tickets:\n${safeJson(tickets.map((ticket) => ({
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      milestoneNumber: ticket.milestoneNumber,
      estimatedHours: ticket.estimatedHours,
    })), 7000)}`,
    `Milestones:\n${safeJson(milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description,
      status: milestone.status,
      amountUsd: milestone.amountUsd,
      dueDate: milestone.dueDate,
    })), 7000)}`,
    `Participants:\n${safeJson(participants.map((participant: any) => ({
      name: participant.userId?.name,
      email: participant.userId?.email,
      role: participant.userId?.role,
      status: participant.status,
    })), 4000)}`,
    `NDA:\n${safeJson(nda ? { status: nda.status, signedBy: nda.signedBy, content: nda.content } : null, 5000)}`,
  ].join("\n\n");
}

async function formatWorkspaceChannels(room: InstanceType<typeof LiveRoom>, channels: Array<InstanceType<typeof RoomChannel>>, viewerId: string) {
  const userIds = [...new Set(channels.flatMap((channel) => channel.participantIds.map(String)))];
  const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select("name email") : [];
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return channels.map((channel) => {
    const formatted = (() => {
    if (channel.type === "general") return formatRoomChannel(channel, "general");
    if (channel.type === "interview") {
      const talentNames = channel.participantIds
        .map(String)
        .filter((id) => id !== String(room.businessId))
        .map((id) => userById.get(id)?.name)
        .filter(Boolean);
      const displayName = talentNames.length === 1
        ? `Interview: ${talentNames[0]}`
        : talentNames.length > 1
          ? `Interview: ${talentNames.join(", ")}`
          : "Interview";
      return formatRoomChannel(channel, displayName);
    }
    const otherId = channel.participantIds.map(String).find((id) => id !== viewerId) ?? String(room.businessId);
    const other = otherId ? userById.get(otherId) : null;
    return formatRoomChannel(channel, other?.name ? `DM: ${other.name}` : "Direct message");
    })();
    if (!isRoomOwner(room, viewerId) && formatted.type === "interview") {
      return { ...formatted, interviewNotes: null };
    }
    return formatted;
  });
}

function extractMentions(message: string): string[] {
  const mentions = new Set<string>();
  for (const match of message.matchAll(/@([a-z0-9_-]+)/gi)) {
    mentions.add(match[1]!.toLowerCase());
  }
  return [...mentions];
}

function messageMentionsDehixAi(message: string): boolean {
  return extractMentions(message).includes("dehixai");
}

async function createPermissionAwareAiReply(
  room: InstanceType<typeof LiveRoom>,
  channel: InstanceType<typeof RoomChannel>,
  userId: string,
  userMessage: string,
  io = getIo()
) {
  const context = await buildPermissionAwareAiContext(room, channel, userId);
  let reply = "DEHIX AI is not configured for this environment.";

  if (isAiProviderEnabled) {
    const systemPrompt = `You are DEHIX AI inside a Discord-style LiveRoom.

Use only the context below. If the current user is talent and something is not in the provided context, say that the business has not granted access to that information yet.
Do not reveal hidden project documents, private business notes, other talent DMs, or restricted Phase 1/2/3 details unless they are explicitly present in the context.
Answer directly and concisely in Markdown.

${context}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 1200,
    });
    reply = completion.choices[0]?.message?.content ?? "I couldn't process that request.";
  }

  const savedReply = await RoomMessage.create({
    roomId: room._id,
    channelId: channel._id,
    senderName: "DEHIX AI",
    type: "ai",
    message: reply,
    mentions: [],
  });
  emitChannelMessage(io, room, channel, savedReply);
  return savedReply;
}

function emitChannelMessage(io: ReturnType<typeof getIo>, room: InstanceType<typeof LiveRoom>, channel: InstanceType<typeof RoomChannel>, message: InstanceType<typeof RoomMessage>) {
  if (!io) return;
  const payload = formatRoomMessage(message);
  if (channel.type === "general") {
    io.to(`room:${room._id}`).emit("room:message_created", payload);
    return;
  }
  for (const participantId of channel.participantIds) {
    io.to(`talent:${String(participantId)}`).emit("room:message_created", payload);
  }
}

async function buildPermissionAwareAiContext(
  room: InstanceType<typeof LiveRoom>,
  channel: InstanceType<typeof RoomChannel>,
  userId: string
): Promise<string> {
  const owner = isRoomOwner(room, userId);
  const visibleChannels = owner ? await RoomChannel.find({ roomId: room._id }) : await getVisibleChannels(room, userId);
  const visibleChannelIds = visibleChannels.map((visibleChannel) => visibleChannel._id);
  const [messages, generatedDocs] = await Promise.all([
    RoomMessage.find({ roomId: room._id, channelId: { $in: visibleChannelIds } }).sort({ createdAt: 1 }).limit(200),
    GeneratedDoc.find({ roomId: room._id }).sort({ createdAt: -1 }),
  ]);
  const visibleConversation = messages
    .map((message) => `${message.type === "ai" ? "DEHIX AI" : message.senderName}: ${message.message}`)
    .join("\n");

  if (owner) {
    const session = await findLaunchSessionForRoom(room);
    const launchContext = await buildLaunchContext(session);
    const roomContext = await buildRoomContext(room);
    const docs = generatedDocs.map((doc) => `${doc.title} (${doc.documentType})\n${doc.content}`).join("\n\n");
    return [
      "Current user: business owner. Full room context is allowed.",
      `Active channel: ${channel.name}`,
      launchContext,
      roomContext,
      `Generated documents:\n${docs || "No generated documents yet."}`,
      `Visible room conversations:\n${visibleConversation || "No messages yet."}`,
    ].join("\n\n");
  }

  const participant = await RoomParticipant.findOne({ roomId: room._id, userId, status: { $in: ["joined", "accepted"] } });
  const role = participant?.roleId ? await RoomRole.findById(participant.roleId) : null;
  const tickets = participant?.roleId
    ? await Ticket.find({ roomId: room._id, assignedRole: participant.roleId })
    : [];
  const allowedDocs = await buildAllowedDocumentContext(room, userId);
  return [
    "Current user: invited talent. Context is permission-filtered.",
    `Room title: ${room.title}`,
    `Room status: ${room.status}`,
    `Talent role:\n${role ? safeJson(formatRole(role), 2000) : "No role assigned."}`,
    `Assigned tickets:\n${safeJson(tickets.map(formatTicket), 5000)}`,
    `Allowed documents:\n${allowedDocs || "No documents have been granted by the business yet."}`,
    `Visible room conversations:\n${visibleConversation || "No messages yet."}`,
  ].join("\n\n");
}

async function buildAllowedDocumentContext(room: InstanceType<typeof LiveRoom>, userId: string): Promise<string> {
  const catalog = await getRoomDocumentCatalog(room, userId);
  const chunks: string[] = [];
  for (const doc of catalog) {
    const preview = await buildRoomDocumentPreview(room, doc.docType);
    if (preview) {
      chunks.push(`${preview.title} (${preview.documentType})\n${preview.content}`);
    }
  }
  return chunks.join("\n\n").slice(0, 16000);
}

async function resolveBlueprintForRoom(room: InstanceType<typeof LiveRoom>): Promise<any | null> {
  const session = await findLaunchSessionForRoom(room);
  const brief = room.aiScopedBrief as any;
  if (session?.technicalDocText) {
    try {
      return JSON.parse(session.technicalDocText);
    } catch {
      return null;
    }
  }
  if (brief?.businessBlueprint) return brief.businessBlueprint;
  if (!brief) return null;
  return {
    executive_summary: {
      idea_name: room.title,
      one_line_description: brief?.projectSummary || room.rawDescription,
      business_goal: brief?.projectSummary || room.rawDescription,
      target_market: "Global / Multi-region",
      recommended_launch_strategy: "MVP Rollout",
    },
    mvp_definition: {
      must_have_features: brief?.tickets?.map((ticket: any) => ({ feature: ticket.title, purpose: ticket.description || "Core ticket task." })) || [],
      should_have_features: [],
      future_features: [],
      excluded_from_mvp: [],
    },
    technical_architecture: {
      recommended_stack: {
        frontend: "React / Vite / TailwindCSS",
        backend: "Node.js / Express / Socket.io",
        database: "MongoDB / Mongoose",
        authentication: "JWT / Cookie Session",
        cloud: "AWS / Vercel",
      },
      system_components: [
        { component: "Frontend Portal", purpose: "Client interaction and UI dashboard" },
        { component: "API Backend Server", purpose: "Business logic and database persistence" },
      ],
    },
    team_requirements: {
      recommended_team: brief?.roles?.map((role: any) => ({ role: role.roleTitle, responsibilities: role.responsibilities })) || [],
      minimum_team: brief?.roles?.slice(0, 2)?.map((role: any) => role.roleTitle) || [],
    },
    development_roadmap: {
      phase_1_discovery: { duration: "1 week", deliverables: ["Requirement spec", "Figma prototype"] },
      phase_3_mvp_development: { duration: `${brief?.estimatedWeeks || 6} weeks`, deliverables: ["Frontend/Backend integration", "Production MVP"] },
    },
    cost_estimation: {
      mvp_budget: {
        minimum: brief?.suggestedTotalBudgetUsd ? `$${Math.round(brief.suggestedTotalBudgetUsd * 0.75).toLocaleString()}` : "TBD",
        expected: brief?.suggestedTotalBudgetUsd ? `$${brief.suggestedTotalBudgetUsd.toLocaleString()}` : "TBD",
        high_end: brief?.suggestedTotalBudgetUsd ? `$${Math.round(brief.suggestedTotalBudgetUsd * 1.3).toLocaleString()}` : "TBD",
      },
    },
  };
}

async function buildRoomDocumentPreview(room: InstanceType<typeof LiveRoom>, docType: string) {
  const generated = await GeneratedDoc.findOne({ roomId: room._id, documentType: docType }).sort({ createdAt: -1 });
  if (generated) {
    return {
      _id: generated._id,
      title: generated.title,
      documentType: generated.documentType,
      content: generated.content,
      messageCount: generated.messageCount,
    };
  }

  const session = await findLaunchSessionForRoom(room);
  const brief = room.aiScopedBrief as any;
  const blueprint = await resolveBlueprintForRoom(room);
  const standard = STANDARD_ROOM_DOCUMENTS.find((doc) => doc.docType === docType);
  if (!standard) return null;

  const contentByType: Record<string, unknown> = {
    business_validation: session?.researchText ?? brief?.businessValidation ?? null,
    business_blueprint: session?.technicalDocText ?? brief?.businessBlueprint ?? blueprint,
    full_business_blueprint: blueprint,
    executive_summary: blueprint?.executive_summary,
    mvp_scope: blueprint?.mvp_definition,
    technical_architecture: blueprint?.technical_architecture,
    freelancer_hiring_brief: blueprint?.team_requirements,
    roadmap_budget: {
      development_roadmap: blueprint?.development_roadmap,
      cost_estimation: blueprint?.cost_estimation,
    },
  };
  const content = contentByType[docType];
  return {
    title: `${room.title} - ${standard.title}`,
    documentType: docType,
    content: safeJson(content, 12000),
    messageCount: 0,
  };
}

async function buildStandardRoomDocumentPdf(room: InstanceType<typeof LiveRoom>, docType: string): Promise<{ filename: string; buffer: Buffer } | null> {
  const session = await findLaunchSessionForRoom(room);
  const brief = room.aiScopedBrief as any;
  const blueprint = await resolveBlueprintForRoom(room);
  const filename = `${room.roomCode}-${docType.replace(/_/g, "-")}.pdf`;

  if (docType === "business_validation") {
    if (session?.researchText) return { filename, buffer: await getOrCreateBusinessValidationPdf(session) };
    if (brief?.businessValidation) return { filename, buffer: await buildBusinessValidationPdf(`${room.title} - Business Validation`, brief.businessValidation) };
    return null;
  }
  if (docType === "business_blueprint" || docType === "full_business_blueprint") {
    if (session?.technicalDocText) return { filename, buffer: await getOrCreateBusinessBlueprintPdf(session) };
    if (brief?.businessBlueprint) return { filename, buffer: await buildBusinessBlueprintPdf(`${room.title} - Business Blueprint`, brief.businessBlueprint) };
    if (blueprint) return { filename, buffer: await buildBusinessBlueprintPdf(`${room.title} - Business Blueprint`, blueprint) };
    return null;
  }
  if (!blueprint) return null;
  if (docType === "executive_summary") return { filename, buffer: await buildExecutiveSummaryPdf(`${room.title} - Executive Summary`, blueprint) };
  if (docType === "mvp_scope") return { filename, buffer: await buildMvpScopePdf(`${room.title} - MVP Scope Document`, blueprint) };
  if (docType === "technical_architecture") return { filename, buffer: await buildTechnicalArchitecturePdf(`${room.title} - Technical Architecture`, blueprint) };
  if (docType === "freelancer_hiring_brief") return { filename, buffer: await buildFreelancerHiringBriefPdf(`${room.title} - Freelancer Hiring Brief`, blueprint) };
  if (docType === "roadmap_budget") return { filename, buffer: await buildRoadmapBudgetPdf(`${room.title} - Roadmap & Budget Plan`, blueprint) };
  return null;
}

function formatStoredConversation(messages: any[], maxLength = 12000): string {
  const fullText = messages.map((msg) => `${msg.role === "assistant" ? "DEHIX AI" : msg.userName}: ${msg.message}`).join("\n\n");
  if (fullText.length <= maxLength) return fullText || "No previous conversation yet.";
  return `${fullText.slice(-maxLength)}\n\n[Earlier conversation exists in database but was trimmed from this request because of model context limits.]`;
}

async function getOrCreateDocumentPdf(room: any, docType: string, req: AuthRequest): Promise<{ filename: string; buffer: Buffer } | null> {
  const label = DOC_TYPE_LABELS[docType] || docType;
  const filename = `${room.roomCode}-${docType.replace(/_/g, "-")}.pdf`;

  // 1. Check if already generated in database
  const existing = await GeneratedDoc.findOne({ roomId: room._id, documentType: docType });
  if (existing) {
    const { buildGeneratedDocPdf } = await import("../lib/reportPdf.js");
    const buffer = await buildGeneratedDocPdf(existing.title, existing.documentType, existing.content);
    return { filename, buffer };
  }

  // 2. Generate on the fly using the configured AI provider
  if (!isAiProviderEnabled) return null;

  const session = await findLaunchSessionForRoom(room);
  const threadId = session ? `launch:${String(session._id)}` : `room:${String(room._id)}`;
  const storedMessages = await AiChatMessage.find({ threadId }).sort({ createdAt: 1 });
  const launchContext = await buildLaunchContext(session);
  const roomContext = await buildRoomContext(room);
  const savedConversation = formatStoredConversation(storedMessages);

  const systemPrompts: Record<string, string> = {
    pitch_deck: `You are an expert startup pitch deck writer. Given a research conversation, generate a comprehensive, investor-ready pitch deck in plain text format. Include: Cover, Problem, Solution, Market Size (TAM/SAM/SOM with real numbers), Product, Business Model, Traction, Competitive Landscape, Team, Financials, and The Ask. Use ═══ and ─── dividers for sections. Be specific with numbers.`,
    technical_deck: `You are a senior solutions architect. Generate a comprehensive technical deck from this research conversation. Include: Architecture overview (ASCII diagram), Tech Stack, Key Technical Decisions (with rationale and tradeoffs), Security Model, Scalability Plan, Data Models, API Design, Development Roadmap. Use ═══ and ─── dividers.`,
    bd_strategy: `You are a go-to-market strategy expert. Generate a comprehensive BD strategy document from this research conversation. Include: Market Opportunity, Target Segments (with profiles and pain points), Value Proposition, Go-to-Market Strategy, Partnership Strategy, Revenue Model & Pricing, Sales Process, KPIs. Be specific with numbers and channels.`,
    sow: `You are a contract specialist. Generate a detailed Statement of Work from this research conversation. Include: Project Overview, Scope of Work (in scope and out of scope), Deliverables with milestones, Timeline, Team Structure with rates, Assumptions & Dependencies, Change Management, Payment Schedule (milestone escrow), Acceptance Criteria, Signature blocks. Be legally precise.`,
    project_brief: `You are a senior product manager. Generate a comprehensive project brief from this research conversation. Include: Executive Summary, Background & Context, Business Objectives, Functional Requirements (P0/P1/P2), Technical Requirements, Out of Scope, Success Criteria, Risk Register, and Stakeholders. Be thorough and specific.`,
    idea_validation_report: `You are an expert startup consultant and VC analyst. Given the research conversation context, generate a detailed, professional Idea Validation Report in plain text format. Explain whether the business idea is viable, needs work, or is highly risky. Include sections for: Market Demand Analysis, Target Audience Profiling, Competitive Landscape, Primary Risks & Hurdles, and Actionable Suggestions/Recommendations. Use ═══ and ─── dividers for sections.`,
    business_requirement_document: `You are a senior business analyst. Given the research conversation context, generate a comprehensive Business Requirement Document (BRD) in plain text format. Include sections for: Business Need (problem statement & business value), Strategic Goals, User Problems Solved, Expected Outcomes & Benefits, Success Criteria & Key Performance Indicators (KPIs), and Business Rules/Constraints. Use ═══ and ─── dividers for sections.`,
    project_requirement_document: `You are a lead product manager. Given the research conversation context, generate a detailed Product/Project Requirement Document (PRD) in plain text format. Include sections for: Product Overview, User Roles & Personas, Key Features & Functional Specifications, Detailed System Workflows, Expected System Behavior (handling success and failure cases), and Out-of-Scope items. Use ═══ and ─── dividers for sections.`,
    mvp_scope_document: `You are an experienced startup advisor and product manager. Given the research conversation context, generate a precise MVP Scope Document in plain text format. Include sections for: MVP Goal & Value Proposition, Must-Have Features (V1 Core), Nice-to-Have Features (Deferred to V2), Strictly Excluded/Out-of-Scope Items (to prevent scope creep), and Strategic Scoping Rationale. Use ═══ and ─── dividers for sections.`,
    technical_architecture_document: `You are a principal software architect and CTO. Given the research conversation context, generate a comprehensive Technical Architecture Document in plain text format. Include sections for: System Overview & Architecture Diagram (in ASCII format), Recommended Frontend Stack (with reasons), Recommended Backend & Database Stack (with reasons), APIs & Integration Points, Security & Authentication Strategy, Infrastructure/Hosting Plan, and Critical Tradeoffs/Risks. Use ═══ and ─── dividers for sections.`,
    feature_list_document: `You are a product management and engineering lead. Given the research conversation context, generate a detailed Feature List Document in plain text format. List all required features grouped by product modules (e.g. Authentication, Core Workflows, Payments). Prioritize each feature with a clear priority level: Must-Have (P0), Should-Have (P1), or Future Feature (P2). For each feature, provide a brief description of what it does and why it is included. Use ═══ and ─── dividers for sections.`,
    development_roadmap: `You are a senior project manager and scrum master. Given the research conversation context, generate a clear, execution-focused Development Roadmap in plain text format. Organize the roadmap into phases: Phase 1: Research & Discovery, Phase 2: Design & Prototyping, Phase 3: MVP Development, Phase 4: Testing & Quality Assurance, Phase 5: Launch & Post-Launch Improvements. For each phase, provide estimated durations, key milestones, and critical deliverables. Use ═══ and ─── dividers for sections.`,
  };

  const userPrompt = `Here is the room context and research conversation to base the document on:\n\n` +
    `Launch Context:\n${launchContext}\n\n` +
    `Room Context:\n${roomContext}\n\n` +
    `Conversation:\n${savedConversation}\n\n` +
    `Project title: ${room.title}\n\n` +
    `Generate the full document now.`;

  const completion = await azureOpenai.chat.completions.create({
    model: azureOpenAiDeployment,
    messages: [
      { role: "system", content: systemPrompts[docType] ?? systemPrompts.project_brief },
      { role: "user", content: userPrompt }
    ],
    max_completion_tokens: 3000,
  });

  const content = completion.choices[0]?.message?.content ?? "";
  if (!content) return null;

  // Save to database so it is cached
  const saved = await GeneratedDoc.create({
    roomId: room._id,
    documentType: docType,
    title: `${room.title} — ${DOC_TYPE_LABELS[docType]}`,
    content,
    messageCount: storedMessages.length,
    createdBy: req.userId,
  });

  const { buildGeneratedDocPdf } = await import("../lib/reportPdf.js");
  const buffer = await buildGeneratedDocPdf(saved.title, saved.documentType, saved.content);
  return { filename, buffer };
}

router.get("/:id/documents-zip", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const docs = await getRoomDocumentCatalog(room, req.userId!);
    if (!isRoomOwner(room, req.userId) && docs.length === 0) {
      res.status(403).json({ error: "No room documents have been granted to you yet" });
      return;
    }
    const files: Array<{ filename: string; buffer: Buffer }> = [];
    const { buildGeneratedDocPdf } = await import("../lib/reportPdf.js");
    for (const doc of docs) {
      try {
        if (doc.source === "generated" && doc.documentId) {
          const generated = await GeneratedDoc.findOne({ _id: doc.documentId, roomId: room._id });
          if (generated) {
            const buffer = await buildGeneratedDocPdf(generated.title, generated.documentType, generated.content);
            files.push({ filename: `${room.roomCode}-${generated.documentType.replace(/_/g, "-")}.pdf`, buffer });
          }
        } else {
          const built = await buildStandardRoomDocumentPdf(room, doc.docType);
          if (built) files.push(built);
        }
      } catch (err) {
        req.log.warn({ err, docType: doc.docType }, "Skipped document while building ZIP");
      }
    }

    if (files.length === 0) {
      res.status(404).json({ error: "No documents available to download" });
      return;
    }

    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.filename, f.buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${room.roomCode}-all-documents.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    req.log.error({ err }, "Failed to generate documents ZIP");
    res.status(500).json({ error: "Failed to generate documents ZIP" });
  }
});

router.get("/:id/export", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (!isRoomOwner(room, req.userId)) {
      res.status(403).json({ error: "Only the business owner can export the full room" });
      return;
    }
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

router.delete("/:id/participants/:participantId", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (String(room.businessId) !== req.userId) { res.status(403).json({ error: "Only the room owner can remove participants" }); return; }
    const deleted = await RoomParticipant.findOneAndDelete({
      _id: req.params["participantId"],
      roomId: req.params["id"],
    });
    if (!deleted) {
      res.status(404).json({ error: "Participant not found in this room" });
      return;
    }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:participant_removed", { roomId: req.params["id"], participantId: req.params["participantId"] });
    RoomActivity.create({ roomId: String(req.params["id"]), type: "participant_removed", actorId: req.userId }).catch(() => { });
    res.json({ message: "Participant removed" });
  } catch (err) {
    req.log.error({ err }, "removeParticipant error");
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

router.put("/:id/notes", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
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

router.put("/:id/meet-link", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
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

router.get("/:id/activity", requireAuth, requireRoomAccess, async (req: AuthRequest, res) => {
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

router.put("/:id/brief", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  const { brief } = req.body;
  if (!brief) { res.status(400).json({ error: "brief required" }); return; }
  try {
    const room = await LiveRoom.findByIdAndUpdate(
      req.params["id"],
      { aiScopedBrief: brief, status: "matching" },
      { new: true }
    );
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    RoomActivity.create({ roomId: String(req.params["id"]), type: "brief_generated", actorId: req.userId }).catch(() => { });
    res.json(formatRoom(room));
  } catch (err) {
    req.log.error({ err }, "saveBrief error");
    res.status(500).json({ error: "Failed to save brief" });
  }
});

router.put("/:id/status", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
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

router.post("/:id/participants", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  const { userId, roleId } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  try {
    const roomId = String(req.params["id"]);
    const result = await inviteTalentToRoom({ roomId, talentId: String(userId), roleId: typeof roleId === "string" ? roleId : undefined });
    res.status(result.created ? 201 : 200).json({
      ...formatParticipant(result.participant),
      message: getInviteResultMessage(result),
    });
  } catch (err) {
    if (err instanceof RoomInviteError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "inviteParticipant error");
    res.status(500).json({ error: "Failed to invite talent" });
  }
});

function getInviteResultMessage(result: Awaited<ReturnType<typeof inviteTalentToRoom>>): string {
  if (result.alreadyMember) return "Talent is already in this room";
  if (result.reactivated) return "Talent re-invited";
  if (result.roleChanged) return "Invitation updated";
  if (!result.created) return "Invitation resent";
  return "Talent invited";
}

function clampTopK(value: unknown): number {
  const parsed = Number(value ?? 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function cleanMessage(value: unknown): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) return "We liked your profile and want to discuss this DEHIX project.";
  return message.slice(0, 2000);
}

async function resolveRoomRole(roomId: string, roleId?: unknown, roleTitle?: unknown) {
  if (typeof roleId === "string" && roleId.trim()) {
    return RoomRole.findOne({ _id: roleId, roomId });
  }
  if (typeof roleTitle === "string" && roleTitle.trim()) {
    const roles = await RoomRole.find({ roomId });
    return roles.find((role) => role.roleTitle.toLowerCase() === roleTitle.trim().toLowerCase()) ?? null;
  }
  return null;
}

function buildRecommendedTeam(roles: Array<InstanceType<typeof RoomRole>>, matches: any[]) {
  const grouped = new Map<string, any[]>();
  for (const match of matches) {
    const key = String(match.roleId);
    grouped.set(key, [...(grouped.get(key) ?? []), match]);
  }

  return roles.map((role) => {
    const topMatches = (grouped.get(String(role._id)) ?? [])
      .sort((a, b) => Number(b.matchScore ?? 0) - Number(a.matchScore ?? 0))
      .map(formatFreelancerMatch);
    return {
      roleId: role._id,
      role: role.roleTitle,
      skillDomain: role.skillDomain,
      quantityRequired: 1,
      topMatches,
    };
  });
}

function formatFreelancerMatch(match: any) {
  const freelancer = match.freelancerId as any;
  const completedProjects = Number(freelancer?.completedProjects ?? 0);
  return {
    matchId: match._id,
    roleId: match.roleId,
    role: match.role,
    freelancerId: freelancer?._id ?? match.freelancerId,
    name: freelancer?.name ?? "Unknown freelancer",
    email: freelancer?.email ?? null,
    avatarUrl: freelancer?.avatarUrl ?? null,
    walletAddress: freelancer?.walletAddress ?? null,
    availability: freelancer?.availability ?? (freelancer?.isOnline ? "available" : "unknown"),
    presenceStatus: freelancer?.isOnline ? "online" : "offline",
    isOnline: freelancer?.isOnline ?? false,
    lastSeenAt: freelancer?.lastSeen ?? null,
    rating: freelancer?.rating ?? null,
    completedProjects,
    matchScore: match.matchScore,
    matchedSkills: match.matchedSkills ?? [],
    missingSkills: match.missingSkills ?? [],
    scoreBreakdown: match.scoreBreakdown ?? {},
    status: match.status,
  };
}

async function sendProjectEnquiry({
  roomId,
  businessId,
  message,
  sendEmailToOffline,
  matches,
  log,
}: {
  roomId: string;
  businessId: string;
  message: string;
  sendEmailToOffline: boolean;
  matches: any[];
  log: any;
}) {
  const enquiry = await ProjectEnquiry.create({
    roomId,
    businessId,
    message,
    sendEmailToOffline,
    status: "sent",
  });
  const io = getIo();
  const cooldownStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const uniqueMatches = new Map<string, any>();
  for (const match of matches) {
    const freelancer = match.freelancerId as any;
    const key = `${String(freelancer?._id ?? match.freelancerId)}:${String(match.roleId)}`;
    if (!uniqueMatches.has(key)) uniqueMatches.set(key, match);
  }

  const recipients: any[] = [];
  for (const match of uniqueMatches.values()) {
    const freelancer = match.freelancerId as any;
    const freelancerId = String(freelancer?._id ?? match.freelancerId);
    if (!freelancerId) continue;

    const duplicate = await ProjectEnquiryRecipient.findOne({
      roomId,
      freelancerId,
      roleId: match.roleId,
      createdAt: { $gte: cooldownStart },
    });
    if (duplicate) {
      recipients.push({
        freelancerId,
        role: match.role,
        presenceStatusAtSend: freelancer?.isOnline ? "online" : "offline",
        emailStatus: "skipped",
        notificationStatus: "skipped",
        responseStatus: duplicate.responseStatus,
        skippedDuplicate: true,
      });
      continue;
    }

    const presenceStatusAtSend = freelancer?.isOnline ? "online" : "offline";
    const inAppAllowed = freelancer?.notificationPreferences?.inAppNotifications !== false;
    const emailAllowed =
      sendEmailToOffline &&
      presenceStatusAtSend === "offline" &&
      freelancer?.emailVerified !== false &&
      freelancer?.notificationPreferences?.projectEnquiryEmail !== false &&
      !["blocked", "suspended"].includes(String(freelancer?.accountStatus ?? "active"));
    const emailStatus = presenceStatusAtSend === "online" ? "not_required" : emailAllowed ? "queued" : "skipped";
    const notificationStatus = inAppAllowed ? "sent" : "skipped";

    const recipient = await ProjectEnquiryRecipient.create({
      enquiryId: enquiry._id,
      roomId,
      freelancerId,
      roleId: match.roleId,
      role: match.role,
      matchScore: match.matchScore,
      matchedSkills: match.matchedSkills ?? [],
      presenceStatusAtSend,
      emailStatus,
      notificationStatus,
      responseStatus: "pending",
    });

    if (notificationStatus === "sent") {
      await Notification.create({
        userId: freelancerId,
        type: "project_enquiry",
        title: "New project enquiry",
        message: "You have received a project enquiry matching your skills.",
        roomId,
        enquiryRecipientId: recipient._id,
      }).catch((err) => log?.warn?.({ err }, "Failed to create enquiry notification"));
      if (io) {
        io.to(`talent:${freelancerId}`).emit("talent:project_enquiry", {
          roomId,
          enquiryRecipientId: recipient._id,
          role: match.role,
          matchScore: match.matchScore,
        });
      }
    }

    await FreelancerMatch.findOneAndUpdate(
      { roomId, freelancerId, roleId: match.roleId },
      { status: "enquired" }
    );
    recipients.push(formatEnquiryRecipient(recipient, enquiry, freelancer));
  }

  const sentCount = recipients.filter((recipient) => !recipient.skippedDuplicate).length;
  if (sentCount === 0) {
    enquiry.status = "failed";
    await enquiry.save();
  } else if (sentCount < uniqueMatches.size) {
    enquiry.status = "partially_sent";
    await enquiry.save();
  }

  RoomActivity.create({
    roomId,
    type: "freelancer_enquiry_sent",
    actorId: businessId,
    meta: { sentCount, requestedCount: uniqueMatches.size },
  }).catch(() => {});
  if (io) io.to(`room:${roomId}`).emit("room:freelancer_enquiry_sent", { roomId, sentCount });

  return {
    success: sentCount > 0,
    enquiryId: enquiry._id,
    sentCount,
    recipients,
  };
}

function formatEnquiryRecipient(recipient: any, enquiry?: any, populatedFreelancer?: any) {
  const freelancer = populatedFreelancer ?? (recipient.freelancerId as any);
  return {
    _id: recipient._id,
    enquiryId: recipient.enquiryId,
    roomId: recipient.roomId,
    freelancerId: freelancer?._id ?? recipient.freelancerId,
    name: freelancer?.name ?? "Unknown freelancer",
    email: freelancer?.email ?? null,
    roleId: recipient.roleId ?? null,
    role: recipient.role,
    matchScore: recipient.matchScore ?? null,
    matchedSkills: recipient.matchedSkills ?? [],
    presenceStatusAtSend: recipient.presenceStatusAtSend,
    emailStatus: recipient.emailStatus,
    notificationStatus: recipient.notificationStatus,
    responseStatus: recipient.responseStatus,
    responseMessage: recipient.responseMessage ?? null,
    sentAt: recipient.createdAt,
    respondedAt: recipient.respondedAt ?? null,
    message: enquiry?.message ?? null,
    enquiryStatus: enquiry?.status ?? null,
  };
}

function formatRoom(room: InstanceType<typeof LiveRoom>) {
  return {
    _id: room._id,
    roomCode: room.roomCode,
    launchSessionId: room.launchSessionId ?? null,
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

function formatRoomForUser(room: InstanceType<typeof LiveRoom>, userId: string | undefined) {
  const formatted = formatRoom(room);
  if (isRoomOwner(room, userId)) return formatted;
  return {
    ...formatted,
    rawDescription: "",
    aiScopedBrief: null,
    notes: null,
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
  const populatedUser = (p as any).userId?.email ? (p as any).userId : null;
  const talentId = String(populatedUser?._id ?? p.userId);
  return {
    _id: p._id,
    userId: p.userId,
    talentId,
    name: populatedUser?.name ?? "Talent",
    email: populatedUser?.email ?? null,
    avatarUrl: populatedUser?.avatarUrl ?? null,
    user: populatedUser,
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
