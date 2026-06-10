import { Router } from "express";
import { nanoid } from "nanoid";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
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
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled } from "../lib/openai.js";
import { TECH_MANDATORY_QUESTIONS } from "../lib/launchQuestions.js";
import { requireRoomAccess, requireRoomOwner } from "../lib/roomAccess.js";

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

router.post("/:id/invite", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  const parsed = InviteTalentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { talentId, roleId } = parsed.data;
  try {
    const roomId = String(req.params["id"]);
    const role = await RoomRole.findOne({ _id: roleId, roomId });
    if (!role) {
      res.status(400).json({ error: "Role does not belong to this room" });
      return;
    }
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
    await RoomRole.findOneAndUpdate({ _id: roleId, roomId }, { status: "invited" });
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

router.get("/:id/business-validation.pdf", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (String(room.businessId) !== req.userId) {
      res.status(403).json({ error: "Only the room owner can download the validation PDF" });
      return;
    }

    const session = await findLaunchSessionForRoom(room);
    const pdf = session?.researchText
      ? await getOrCreateBusinessValidationPdf(session)
      : await buildBusinessValidationPdf(`${room.title} - Business Validation Report`, (room.aiScopedBrief as any)?.businessValidation);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${room.roomCode}-business-validation.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "downloadRoomBusinessValidationPdf error");
    res.status(500).json({ error: "Failed to download business validation PDF" });
  }
});

router.get("/:id/business-blueprint.pdf", requireAuth, requireRoomOwner, async (req: AuthRequest, res) => {
  try {
    const room = await LiveRoom.findById(req.params["id"]);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (String(room.businessId) !== req.userId) {
      res.status(403).json({ error: "Only the room owner can download the blueprint PDF" });
      return;
    }

    const session = await findLaunchSessionForRoom(room);
    const brief = room.aiScopedBrief as any;
    let pdf: Buffer;
    if (session?.technicalDocText) {
      pdf = await getOrCreateBusinessBlueprintPdf(session);
    } else if (brief?.businessBlueprint) {
      pdf = await buildBusinessBlueprintPdf(`${room.title} - Business Development Blueprint`, brief.businessBlueprint);
    } else {
      res.status(404).json({ error: "Blueprint report is not available for this room" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${room.roomCode}-business-blueprint.pdf"`);
    res.send(pdf);
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

  // 2. Generate on the fly using Azure OpenAI
  if (!isAzureOpenAiEnabled) return null;

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

    const isOwner = String(room.businessId) === req.userId;
    const isParticipant = await RoomParticipant.exists({
      roomId: room._id,
      userId: req.userId,
      status: { $in: ["joined", "accepted"] },
    });
    if (!isOwner && !isParticipant) {
      res.status(403).json({ error: "You do not have access to this room documents" });
      return;
    }

    const session = await findLaunchSessionForRoom(room);
    const brief = room.aiScopedBrief as any;

    let blueprint: any = null;
    if (session?.technicalDocText) {
      try {
        blueprint = JSON.parse(session.technicalDocText);
      } catch (e) { }
    }
    if (!blueprint && brief?.businessBlueprint) {
      blueprint = brief.businessBlueprint;
    }

    if (!blueprint) {
      // Fallback mapping from Scoped Brief context so it never fails
      blueprint = {
        executive_summary: {
          idea_name: room.title,
          one_line_description: brief?.projectSummary || room.rawDescription,
          business_goal: brief?.projectSummary || room.rawDescription,
          target_market: "Global / Multi-region",
          recommended_launch_strategy: "MVP Rollout"
        },
        problem_definition: {
          problem_statement: room.rawDescription,
          current_alternatives: ["Manual workflows"],
          why_existing_solutions_fail: ["High friction, slow turnaround"]
        },
        product_strategy: {
          core_value_proposition: brief?.projectSummary || "Streamlined Web3 hiring platform",
          product_positioning: "MVP platform",
          competitive_advantage: ["Automated matching", "Real-time collaboration"],
          key_success_metrics: ["User conversion rate", "Task completion time"]
        },
        mvp_definition: {
          must_have_features: brief?.tickets?.map((t: any) => ({ feature: t.title, purpose: t.description || "Core ticket task." })) || [],
          should_have_features: [],
          future_features: [],
          excluded_from_mvp: []
        },
        technical_architecture: {
          recommended_stack: {
            frontend: "React / Vite / TailwindCSS",
            backend: "Node.js / Express / Socket.io",
            database: "MongoDB / Mongoose",
            authentication: "JWT / Cookie Session",
            cloud: "AWS / Vercel"
          },
          system_components: [
            { component: "Frontend Portal", purpose: "Client interaction and UI dashboard" },
            { component: "API Backend Server", purpose: "Business logic and database persistence" }
          ],
          api_modules: ["Auth", "Rooms", "Tickets", "Milestones"],
          database_entities: ["User", "LiveRoom", "Ticket", "Milestone"]
        },
        development_roadmap: {
          phase_1_discovery: { duration: "1 week", deliverables: ["Requirement spec", "Figma prototype"] },
          phase_3_mvp_development: { duration: `${brief?.estimatedWeeks || 6} weeks`, deliverables: ["Frontend/Backend integration", "Production MVP"] }
        },
        team_requirements: {
          recommended_team: brief?.roles?.map((r: any) => ({ role: r.roleTitle, responsibilities: r.responsibilities })) || [],
          minimum_team: brief?.roles?.slice(0, 2)?.map((r: any) => r.roleTitle) || []
        },
        cost_estimation: {
          mvp_budget: {
            minimum: brief?.suggestedTotalBudgetUsd ? `$${Math.round(brief.suggestedTotalBudgetUsd * 0.75).toLocaleString()}` : "TBD",
            expected: brief?.suggestedTotalBudgetUsd ? `$${brief.suggestedTotalBudgetUsd.toLocaleString()}` : "TBD",
            high_end: brief?.suggestedTotalBudgetUsd ? `$${Math.round(brief.suggestedTotalBudgetUsd * 1.3).toLocaleString()}` : "TBD"
          }
        }
      };
    }

    const files: Array<{ filename: string; buffer: Buffer }> = [];

    // 1. Full Business Blueprint PDF
    try {
      const fullBlueprint = await buildBusinessBlueprintPdf(`${room.title} - Full Business Blueprint`, blueprint);
      files.push({ filename: `${room.roomCode}-1-full-business-blueprint.pdf`, buffer: fullBlueprint });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling Full Business Blueprint PDF");
    }

    // 2. Executive Summary PDF
    try {
      const execSummary = await buildExecutiveSummaryPdf(`${room.title} - Executive Summary`, blueprint);
      files.push({ filename: `${room.roomCode}-2-executive-summary.pdf`, buffer: execSummary });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling Executive Summary PDF");
    }

    // 3. MVP Scope PDF
    try {
      const mvpScope = await buildMvpScopePdf(`${room.title} - MVP Scope Document`, blueprint);
      files.push({ filename: `${room.roomCode}-3-mvp-scope.pdf`, buffer: mvpScope });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling MVP Scope PDF");
    }

    // 4. Technical Architecture PDF
    try {
      const techArch = await buildTechnicalArchitecturePdf(`${room.title} - Technical Architecture`, blueprint);
      files.push({ filename: `${room.roomCode}-4-technical-architecture.pdf`, buffer: techArch });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling Technical Architecture PDF");
    }

    // 5. Freelancer Hiring Brief PDF
    try {
      const hiringBrief = await buildFreelancerHiringBriefPdf(`${room.title} - Freelancer Hiring Brief`, blueprint);
      files.push({ filename: `${room.roomCode}-5-freelancer-hiring-brief.pdf`, buffer: hiringBrief });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling Freelancer Hiring Brief PDF");
    }

    // 6. Roadmap & Budget PDF
    try {
      const roadmapBudget = await buildRoadmapBudgetPdf(`${room.title} - Roadmap & Budget Plan`, blueprint);
      files.push({ filename: `${room.roomCode}-6-roadmap-and-budget.pdf`, buffer: roadmapBudget });
    } catch (e) {
      req.log.error({ err: e }, "Error compiling Roadmap & Budget PDF");
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
    const room = await LiveRoom.findById(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (roleId) {
      const role = await RoomRole.findOne({ _id: roleId, roomId });
      if (!role) {
        res.status(400).json({ error: "Role does not belong to this room" });
        return;
      }
    }
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
