import { Router, type Response } from "express";
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled, missingAzureOpenAiEnvVars } from "../lib/openai.js";
import { GeneratedDoc } from "../models/GeneratedDoc.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { Ticket } from "../models/Ticket.js";
import { Milestone } from "../models/Milestone.js";
import { Nda } from "../models/Nda.js";
import { User } from "../models/User.js";
import { SbtCredential } from "../models/SbtCredential.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { AiChatMessage } from "../models/AiChatMessage.js";
import { TECH_MANDATORY_QUESTIONS } from "../lib/launchQuestions.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { ScopeProjectBody, MatchTalentBody, GenerateNdaBody, SuggestMilestonesBody, AiChatBody } from "@workspace/api-zod";

const router = Router();

type ConvMsg = {
  userName: string;
  message: string;
  isAi: boolean;
};

type ChatThreadContext = {
  threadId: string;
  launchSession: InstanceType<typeof LaunchSession> | null;
  room: InstanceType<typeof LiveRoom> | null;
};

function requireAzureOpenAi(res: Response): boolean {
  if (isAzureOpenAiEnabled) {
    return true;
  }

  res.status(503).json({
    error: "Azure OpenAI is not configured",
    missingEnvVars: missingAzureOpenAiEnvVars,
  });
  return false;
}

function sendAzureOpenAiError(req: AuthRequest, res: Response, err: unknown, message: string) {
  req.log.error({ err }, message);
  res.status(502).json({ error: message });
}

function safeJson(value: unknown, maxLength = 6000): string {
  if (value === null || value === undefined) return "Not available";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[trimmed for AI context]`;
}

async function resolveChatThread(req: AuthRequest, res: Response): Promise<ChatThreadContext | null> {
  const roomId = typeof req.body.roomId === "string" ? req.body.roomId : typeof req.query.roomId === "string" ? req.query.roomId : "";
  const launchSessionId =
    typeof req.body.launchSessionId === "string"
      ? req.body.launchSessionId
      : typeof req.query.launchSessionId === "string"
        ? req.query.launchSessionId
        : "";

  if (roomId) {
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return null;
    }

    const isOwner = String(room.businessId) === req.userId;
    const isParticipant = await RoomParticipant.exists({ roomId: room._id, userId: req.userId });
    if (!isOwner && !isParticipant) {
      res.status(403).json({ error: "You do not have access to this room chat" });
      return null;
    }

    let launchSession: InstanceType<typeof LaunchSession> | null = null;
    if (room.launchSessionId) {
      launchSession = await LaunchSession.findOne({ _id: room.launchSessionId, userId: room.businessId });
    } else {
      const brief = room.aiScopedBrief as any;
      if (brief?.launchSessionId) {
        launchSession = await LaunchSession.findOne({ _id: brief.launchSessionId, userId: room.businessId });
      }
    }

    return {
      threadId: launchSession ? `launch:${String(launchSession._id)}` : `room:${String(room._id)}`,
      launchSession,
      room,
    };
  }

  if (launchSessionId) {
    const launchSession = await LaunchSession.findOne({ _id: launchSessionId, userId: req.userId });
    if (!launchSession) {
      res.status(404).json({ error: "Launch session not found" });
      return null;
    }
    return {
      threadId: `launch:${String(launchSession._id)}`,
      launchSession,
      room: null,
    };
  }

  res.status(400).json({ error: "roomId or launchSessionId is required" });
  return null;
}

async function buildLaunchContext(session: InstanceType<typeof LaunchSession> | null): Promise<string> {
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

async function buildRoomContext(room: InstanceType<typeof LiveRoom> | null): Promise<string> {
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

function formatStoredConversation(messages: Array<{ role: string; userName: string; message: string }>, maxLength = 12000) {
  const fullText = messages.map((msg) => `${msg.role === "assistant" ? "DEHIX AI" : msg.userName}: ${msg.message}`).join("\n\n");
  if (fullText.length <= maxLength) return fullText || "No previous conversation yet.";
  return `${fullText.slice(-maxLength)}\n\n[Earlier conversation exists in database but was trimmed from this request because of model context limits.]`;
}

router.post("/scope", requireAuth, async (req: AuthRequest, res) => {
  const parsed = ScopeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { description } = parsed.data;

  if (!requireAzureOpenAi(res)) {
    return;
  }

  try {
    const prompt = `You are a senior Web3 project manager. A client has described a project. Extract and return ONLY valid JSON — no markdown, no explanation.

Client description: ${description}

Return this exact JSON structure:
{
  "projectTitle": "string",
  "projectSummary": "string (2 sentences max)",
  "estimatedWeeks": number,
  "complexity": "low|medium|high|very_high",
  "roles": [
    {
      "roleTitle": "string",
      "skillDomain": "string",
      "requiredLevel": 1 or 2,
      "minReputation": number (0-1000),
      "responsibilities": ["string"],
      "estimatedHours": number
    }
  ],
  "milestones": [
    {
      "title": "string",
      "description": "string",
      "durationWeeks": number,
      "percentageOfBudget": number
    }
  ],
  "tickets": [
    {
      "title": "string",
      "description": "string",
      "milestoneNumber": number,
      "roleTitle": "string",
      "estimatedHours": number
    }
  ],
  "technicalRisks": ["string"],
  "suggestedTotalBudgetUsd": number
}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const brief = JSON.parse(cleaned);
    res.json(brief);
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate project scope");
  }
});

router.post("/match", requireAuth, async (req: AuthRequest, res) => {
  const parsed = MatchTalentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { roleTitle, skillDomain, requiredLevel = 1, minReputation = 0 } = parsed.data;
  try {
    const creds = await SbtCredential.find({
      skillDomain: new RegExp(skillDomain, "i"),
      level: { $gte: requiredLevel } as any,
      reputationScore: { $gte: minReputation },
      status: "verified",
    })
      .populate("userId")
      .limit(10);

    const onlineCreds = creds.filter((c) => {
      const u = c.userId as any;
      return u && u.isOnline !== false;
    });

    const results = onlineCreds.slice(0, 5).map((c) => {
      const user = c.userId as any;
      const score = c.reputationScore / 1000;
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl ?? null,
          walletAddress: user.walletAddress ?? null,
          isOnline: user.isOnline,
          createdAt: user.createdAt,
        },
        credential: {
          _id: c._id,
          userId: c.userId,
          skillDomain: c.skillDomain,
          level: c.level,
          reputationScore: c.reputationScore,
          status: c.status,
          githubScore: c.githubScore,
          interviewScore: c.interviewScore,
          projectsCompleted: c.projectsCompleted,
          onChainTx: c.onChainTx ?? null,
          issuedAt: c.issuedAt,
        },
        similarityScore: score,
      };
    });

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "match error");
    res.status(500).json({ error: "Talent matching failed" });
  }
});

router.post("/generate-nda", requireAuth, async (req: AuthRequest, res) => {
  const parsed = GenerateNdaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { roomId } = parsed.data;
  try {
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const business = await User.findById(room.businessId);
    const participants = await RoomParticipant.find({ roomId, status: { $in: ["joined", "accepted"] } })
      .populate("userId", "name email");
    const talentNames = participants.map((p: any) => p.userId?.name ?? "Unknown").join(", ");
    const milestones = await Milestone.find({ roomId });
    const milestoneList = milestones.map((m) => `• ${m.title}`).join("\n  ");

    const saveNda = async (content: string) => {
      return Nda.findOneAndUpdate(
        { roomId },
        { content, status: "draft", signedBy: [] },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    };

    if (!requireAzureOpenAi(res)) {
      return;
    }

    const prompt = `Generate a professional Web3 freelance NDA and project agreement. Return plain text only — no markdown.

Include these sections:
1. Parties (business + all talent members)
2. Project scope (title + summary)
3. Confidentiality obligations (mutual, 2 years)
4. Intellectual property (all code belongs to client upon full payment)
5. Payment terms (milestone-based escrow)
6. Dispute resolution (DEHIX oracle arbitration)
7. Governing law (mention blockchain-native jurisdiction)
8. Signatures section (list all parties)

Details:
Business: ${business?.name ?? "Business"}
Talent: ${talentNames || "TBD"}
Project: ${room.title}
Milestones: ${milestones.map((m) => m.title).join(", ")}
Date: ${new Date().toLocaleDateString()}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const saved = await saveNda(content);
    RoomActivity.create({ roomId: String(roomId), type: "nda_generated", meta: { by: req.userId } }).catch(() => {});
    res.json({ _id: saved._id, roomId: saved.roomId, content: saved.content, signedBy: saved.signedBy, status: saved.status, createdAt: saved.createdAt });
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate NDA");
  }
});

router.post("/suggest-milestones", requireAuth, async (req: AuthRequest, res) => {
  const parsed = SuggestMilestonesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { roomId, totalBudgetUsd = 50000 } = parsed.data;

  if (!requireAzureOpenAi(res)) {
    return;
  }

  try {
    const room = await LiveRoom.findById(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const brief = room.aiScopedBrief as any;

    const prompt = `You are a Web3 project manager. Given this project, suggest 3-4 milestones with escrow amounts.
Return ONLY valid JSON array, no markdown.

Project: ${room.title}
Summary: ${brief?.projectSummary ?? room.rawDescription}
Total Budget: $${totalBudgetUsd}

Return array of: [{ "title": string, "description": string, "amountUsd": number, "dueDate": "YYYY-MM-DD" }]`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const suggestions = JSON.parse(cleaned);
    res.json(suggestions);
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to suggest milestones");
  }
});

router.get("/chat-history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const context = await resolveChatThread(req, res);
    if (!context) return;

    const messages = await AiChatMessage.find({ threadId: context.threadId }).sort({ createdAt: 1 });
    res.json({
      threadId: context.threadId,
      messages: messages.map((msg) => ({
        _id: msg._id,
        id: String(msg._id),
        userId: msg.userId,
        userName: msg.userName,
        role: msg.role,
        message: msg.message,
        isAi: msg.isAi,
        createdAt: msg.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load AI chat history");
    res.status(500).json({ error: "Failed to load AI chat history" });
  }
});

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!requireAzureOpenAi(res)) {
    return;
  }

  try {
    const context = await resolveChatThread(req, res);
    if (!context) return;

    const user = await User.findById(req.userId);
    const userName = user?.name ?? "User";

    await AiChatMessage.create({
      threadId: context.threadId,
      launchSessionId: context.launchSession?._id,
      roomId: context.room?._id,
      userId: req.userId,
      userName,
      role: "user",
      message,
      isAi: false,
    });

    const storedMessages = await AiChatMessage.find({ threadId: context.threadId }).sort({ createdAt: 1 });
    const launchContext = await buildLaunchContext(context.launchSession);
    const roomContext = await buildRoomContext(context.room);
    const savedConversation = formatStoredConversation(storedMessages);
    const clientContext = typeof req.body.clientContext === "string" ? req.body.clientContext.slice(0, 8000) : "No live frontend form context provided.";

    const systemPrompt = `You are the DEHIX Live Room AI, a context-aware project copilot for the full DEHIX launch-to-room workflow.

Your job:
- Understand the user's business idea, validation, blueprint, room dashboard, roles, milestones, tickets, NDA, notes, and chat history.
- Answer using the saved project context first. Do not guess when the answer exists in the context.
- If context is missing or stale, clearly say what is missing.
- Help the user make product, business, technical, hiring, milestone, and execution decisions.
- Keep continuity from the beginning of Phase 1 through the room dashboard.
- Be practical, specific, and concise unless the user asks for depth.

Launch context:
${launchContext}

Live room context:
${roomContext}

Live frontend form context:
${clientContext}

Saved conversation from this thread:
${savedConversation}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_completion_tokens: 1400,
    });

    const reply = completion.choices[0]?.message?.content ?? "I couldn't process that request.";
    const savedReply = await AiChatMessage.create({
      threadId: context.threadId,
      launchSessionId: context.launchSession?._id,
      roomId: context.room?._id,
      userId: req.userId,
      userName: "DEHIX AI",
      role: "assistant",
      message: reply,
      isAi: true,
    });

    res.json({
      threadId: context.threadId,
      reply,
      message: {
        _id: savedReply._id,
        id: String(savedReply._id),
        userId: savedReply.userId,
        userName: savedReply.userName,
        role: savedReply.role,
        message: savedReply.message,
        isAi: savedReply.isAi,
        createdAt: savedReply.createdAt,
      },
    });
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate chat reply");
  }
});

router.post("/chat-legacy", requireAuth, async (req: AuthRequest, res) => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { message, roomId } = parsed.data;
  const rawHistory = Array.isArray(req.body.history) ? req.body.history.slice(-15) : [];
  const history: Array<{ role: "user" | "assistant"; content: string }> = rawHistory.map((m: any) => {
    if (m.role === "user" || m.role === "assistant") {
      return { role: m.role as "user" | "assistant", content: String(m.content ?? m.message ?? "") };
    }
    return {
      role: (m.isAi ? "assistant" : "user") as "user" | "assistant",
      content: String(m.message ?? m.content ?? ""),
    };
  });

  if (!requireAzureOpenAi(res)) {
    return;
  }

  try {
    const room = await LiveRoom.findById(roomId);
    const brief = room?.aiScopedBrief as any;

    const systemPrompt = `You are the DEHIX Live Room AI — an expert research assistant for Web3 product development.

Project context:
- Name: ${room?.title ?? "Unknown"}
- Brief: ${brief?.projectSummary ?? "No brief yet"}
- Status: ${room?.status ?? "unknown"}
- Stack: ${brief?.recommendedStack ?? "Not specified"}

You are deeply knowledgeable about:
• Web3/blockchain architecture (DeFi, NFTs, DAOs, L1/L2s, smart contracts)
• Product strategy and go-to-market for crypto/Web3 startups
• Technical hiring, team structure, market rates for Web3 talent
• Tokenomics, escrow mechanisms, on-chain credential systems
• Project scoping, milestone planning, risk identification

Be thorough and specific. When asked about costs, timelines, or market data, give concrete numbers and ranges.
When asked about technical approaches, compare options with tradeoffs.
Maintain context from earlier in the conversation.
Format your response with clear structure when the answer is complex (use numbered points, bullet lists).`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages,
      max_completion_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? "I couldn't process that request.";
    res.json({ reply });
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate chat reply");
  }
});

router.post("/suggest-tickets", requireAuth, async (req: AuthRequest, res) => {
  const { roomId } = req.body;
  if (!roomId) { res.status(400).json({ error: "roomId required" }); return; }
  try {
    const room = await LiveRoom.findById(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const brief = room.aiScopedBrief as any;

    if (!requireAzureOpenAi(res)) {
      return;
    }

    const prompt = `You are a Web3 engineering lead. Given this project, generate 6-10 actionable development tickets.
Return ONLY valid JSON array, no markdown.

Project: ${room.title}
Summary: ${brief?.projectSummary ?? room.rawDescription}
Complexity: ${brief?.complexity ?? "high"}

Return array of: [{ "title": string (concise action), "description": string (1 sentence), "estimatedHours": number, "milestoneNumber": 1|2|3 }]`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const tickets = JSON.parse(cleaned);
    res.json(tickets);
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to suggest tickets");
  }
});

const DOC_TYPE_LABELS: Record<string, string> = {
  pitch_deck: "Pitch Deck",
  technical_deck: "Technical Deck",
  bd_strategy: "BD Strategy",
  sow: "Statement of Work",
  project_brief: "Project Brief",
};

router.post("/generate-document", requireAuth, async (req: AuthRequest, res) => {
  const { messages, documentType, roomTitle = "Project", roomId } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required and must not be empty" });
    return;
  }
  if (!documentType || !DOC_TYPE_LABELS[documentType]) {
    res.status(400).json({ error: `documentType must be one of: ${Object.keys(DOC_TYPE_LABELS).join(", ")}` });
    return;
  }

  const convMsgs: ConvMsg[] = messages.map((m: any) => ({
    userName: m.userName ?? "User",
    message: m.message ?? "",
    isAi: Boolean(m.isAi),
  }));

  const title = `${roomTitle} — ${DOC_TYPE_LABELS[documentType]}`;

  if (!requireAzureOpenAi(res)) {
    return;
  }

  const conversationText = convMsgs
    .map((m) => `${m.isAi ? "AI" : m.userName}: ${m.message}`)
    .join("\n");

  const systemPrompts: Record<string, string> = {
    pitch_deck: `You are an expert startup pitch deck writer. Given a research conversation, generate a comprehensive, investor-ready pitch deck in plain text format. Include: Cover, Problem, Solution, Market Size (TAM/SAM/SOM with real numbers), Product, Business Model, Traction, Competitive Landscape, Team, Financials, and The Ask. Use ═══ and ─── dividers for sections. Be specific with numbers.`,
    technical_deck: `You are a senior solutions architect. Generate a comprehensive technical deck from this research conversation. Include: Architecture overview (ASCII diagram), Tech Stack, Key Technical Decisions (with rationale and tradeoffs), Security Model, Scalability Plan, Data Models, API Design, Development Roadmap. Use ═══ and ─── dividers.`,
    bd_strategy: `You are a go-to-market strategy expert. Generate a comprehensive BD strategy document from this research conversation. Include: Market Opportunity, Target Segments (with profiles and pain points), Value Proposition, Go-to-Market Strategy, Partnership Strategy, Revenue Model & Pricing, Sales Process, KPIs. Be specific with numbers and channels.`,
    sow: `You are a contract specialist. Generate a detailed Statement of Work from this research conversation. Include: Project Overview, Scope of Work (in scope and out of scope), Deliverables with milestones, Timeline, Team Structure with rates, Assumptions & Dependencies, Change Management, Payment Schedule (milestone escrow), Acceptance Criteria, Signature blocks. Be legally precise.`,
    project_brief: `You are a senior product manager. Generate a comprehensive project brief from this research conversation. Include: Executive Summary, Background & Context, Business Objectives, Functional Requirements (P0/P1/P2), Technical Requirements, Out of Scope, Success Criteria, Risk Register, and Stakeholders. Be thorough and specific.`,
  };

  let content: string;

  try {
    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [
        { role: "system", content: systemPrompts[documentType] ?? systemPrompts.project_brief },
        { role: "user", content: `Here is the research conversation to base the document on:\n\n${conversationText}\n\nProject title: ${roomTitle}\n\nGenerate the full document now.` },
      ],
      max_completion_tokens: 3000,
    });
    content = completion.choices[0]?.message?.content ?? "";
    if (!content) {
      throw new Error("Empty response from Azure OpenAI");
    }
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate document");
    return;
  }

  try {
    const saved = await GeneratedDoc.create({
      roomId: roomId ?? undefined,
      documentType,
      title,
      content,
      messageCount: convMsgs.length,
      createdBy: req.userId,
    });
    res.json({ _id: saved._id, title: saved.title, documentType: saved.documentType, content: saved.content, messageCount: saved.messageCount });
  } catch (err) {
    req.log.error({ err }, "Failed to save GeneratedDoc — returning unsaved");
    res.json({ title, documentType, content, messageCount: convMsgs.length });
  }
});

router.post("/chat-summary", requireAuth, async (req: AuthRequest, res) => {
  const { messages, roomId } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }
  try {
    const room = roomId ? await LiveRoom.findById(roomId).catch(() => null) : null;
    const conversation = (messages as any[])
      .slice(-40)
      .map((m: any) => `${m.isAi ? "AI" : m.userName}: ${m.message}`)
      .join("\n");

    if (!requireAzureOpenAi(res)) {
      return;
    }

    const prompt = `You are a meeting summarization AI. Given this chat conversation, extract key information.
Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview of what was discussed",
  "keyDecisions": ["list of key decisions made"],
  "actionItems": ["list of action items and next steps"]
}

Conversation:
${conversation}

Project: ${room?.title ?? "Web3 Project"}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 512,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to summarize conversation");
  }
});

export default router;
