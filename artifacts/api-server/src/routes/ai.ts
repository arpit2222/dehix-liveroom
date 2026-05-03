import { Router } from "express";
import { openai, isOpenAiEnabled } from "../lib/openai.js";
import { mockScope, mockChat, mockNda, mockMilestones } from "../lib/mockAi.js";
import { mockPitchDeck, mockTechnicalDeck, mockBdStrategy, mockSow, mockProjectBrief, type ConvMsg } from "../lib/mockDocs.js";
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
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { ScopeProjectBody, MatchTalentBody, GenerateNdaBody, SuggestMilestonesBody, AiChatBody } from "@workspace/api-zod";

const router = Router();

router.post("/scope", requireAuth, async (req: AuthRequest, res) => {
  const parsed = ScopeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { description } = parsed.data;

  if (!isOpenAiEnabled) {
    res.json(mockScope(description));
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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const brief = JSON.parse(cleaned);
    res.json(brief);
  } catch (err) {
    req.log.error({ err }, "scope error — falling back to mock");
    res.json(mockScope(description));
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

    if (!isOpenAiEnabled) {
      const content = mockNda(room.title, business?.name ?? "Business", talentNames, milestoneList);
      const saved = await saveNda(content);
      RoomActivity.create({ roomId: String(roomId), type: "nda_generated", meta: { by: req.userId } }).catch(() => {});
      res.json({ _id: saved._id, roomId: saved.roomId, content: saved.content, signedBy: saved.signedBy, status: saved.status, createdAt: saved.createdAt });
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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const saved = await saveNda(content);
    RoomActivity.create({ roomId: String(roomId), type: "nda_generated", meta: { by: req.userId } }).catch(() => {});
    res.json({ _id: saved._id, roomId: saved.roomId, content: saved.content, signedBy: saved.signedBy, status: saved.status, createdAt: saved.createdAt });
  } catch (err) {
    req.log.error({ err }, "generateNda error — falling back to mock");
    try {
      const room = await LiveRoom.findById(roomId);
      const content = mockNda(room?.title ?? "Project", "Business", "", "");
      const saved = await Nda.findOneAndUpdate(
        { roomId },
        { content, status: "draft", signedBy: [] },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.json({ _id: saved._id, roomId: saved.roomId, content: saved.content, signedBy: saved.signedBy, status: saved.status, createdAt: saved.createdAt });
    } catch (fallbackErr) {
      req.log.error({ fallbackErr }, "generateNda fallback also failed");
      res.status(500).json({ error: "Failed to generate NDA. Please try again." });
    }
  }
});

router.post("/suggest-milestones", requireAuth, async (req: AuthRequest, res) => {
  const parsed = SuggestMilestonesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { roomId, totalBudgetUsd = 50000 } = parsed.data;

  if (!isOpenAiEnabled) {
    res.json(mockMilestones(totalBudgetUsd));
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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const suggestions = JSON.parse(cleaned);
    res.json(suggestions);
  } catch (err) {
    req.log.error({ err }, "suggestMilestones error — falling back to mock");
    res.json(mockMilestones(totalBudgetUsd));
  }
});

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
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

  if (!isOpenAiEnabled) {
    const room = await LiveRoom.findById(roomId).catch(() => null);
    res.json({ reply: mockChat(message, room?.title ?? "your project") });
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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages,
      max_completion_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? "I couldn't process that request.";
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "aiChat error — falling back to mock");
    const room = await LiveRoom.findById(roomId).catch(() => null);
    res.json({ reply: mockChat(message, room?.title ?? "your project") });
  }
});

router.post("/suggest-tickets", requireAuth, async (req: AuthRequest, res) => {
  const { roomId } = req.body;
  if (!roomId) { res.status(400).json({ error: "roomId required" }); return; }
  try {
    const room = await LiveRoom.findById(roomId);
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    const brief = room.aiScopedBrief as any;

    if (!isOpenAiEnabled) {
      const mockTickets = [
        { title: "Set up monorepo structure and CI/CD pipeline", estimatedHours: 8, milestoneNumber: 1 },
        { title: "Design and implement core data models", estimatedHours: 12, milestoneNumber: 1 },
        { title: "Build authentication and authorization system", estimatedHours: 10, milestoneNumber: 1 },
        { title: "Implement smart contract core logic", estimatedHours: 24, milestoneNumber: 2 },
        { title: "Write comprehensive unit tests", estimatedHours: 16, milestoneNumber: 2 },
        { title: "Build frontend dashboard skeleton", estimatedHours: 20, milestoneNumber: 2 },
        { title: "Integrate wallet connection (MetaMask / WalletConnect)", estimatedHours: 10, milestoneNumber: 3 },
        { title: "Security audit and penetration testing", estimatedHours: 20, milestoneNumber: 3 },
      ];
      res.json(mockTickets);
      return;
    }

    const prompt = `You are a Web3 engineering lead. Given this project, generate 6-10 actionable development tickets.
Return ONLY valid JSON array, no markdown.

Project: ${room.title}
Summary: ${brief?.projectSummary ?? room.rawDescription}
Complexity: ${brief?.complexity ?? "high"}

Return array of: [{ "title": string (concise action), "description": string (1 sentence), "estimatedHours": number, "milestoneNumber": 1|2|3 }]`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const tickets = JSON.parse(cleaned);
    res.json(tickets);
  } catch (err) {
    req.log.error({ err }, "suggestTickets error");
    res.status(500).json({ error: "Failed to suggest tickets" });
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

  let content: string;

  if (!isOpenAiEnabled) {
    switch (documentType) {
      case "pitch_deck":      content = mockPitchDeck(convMsgs, roomTitle); break;
      case "technical_deck":  content = mockTechnicalDeck(convMsgs, roomTitle); break;
      case "bd_strategy":     content = mockBdStrategy(convMsgs, roomTitle); break;
      case "sow":             content = mockSow(convMsgs, roomTitle); break;
      case "project_brief":   content = mockProjectBrief(convMsgs, roomTitle); break;
      default:                content = mockProjectBrief(convMsgs, roomTitle);
    }
  } else {
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

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompts[documentType] ?? systemPrompts.project_brief },
          { role: "user", content: `Here is the research conversation to base the document on:\n\n${conversationText}\n\nProject title: ${roomTitle}\n\nGenerate the full document now.` },
        ],
        max_completion_tokens: 3000,
      });
      content = completion.choices[0]?.message?.content ?? "";
      if (!content) throw new Error("Empty response from AI");
    } catch (err) {
      req.log.error({ err }, "generate-document AI error — falling back to mock");
      switch (documentType) {
        case "pitch_deck":     content = mockPitchDeck(convMsgs, roomTitle); break;
        case "technical_deck": content = mockTechnicalDeck(convMsgs, roomTitle); break;
        case "bd_strategy":    content = mockBdStrategy(convMsgs, roomTitle); break;
        case "sow":            content = mockSow(convMsgs, roomTitle); break;
        default:               content = mockProjectBrief(convMsgs, roomTitle);
      }
    }
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

    if (!isOpenAiEnabled) {
      res.json({
        summary: `Key discussion points for ${room?.title ?? "this project"}:\n• Project scope and technical architecture discussed\n• Team roles and skill requirements identified\n• Timeline and budget estimates reviewed\n• Next steps: finalize roles and begin talent matching`,
        keyDecisions: ["Proceed with Web3-native architecture", "Use milestone-based escrow", "Begin talent search immediately"],
        actionItems: ["Generate AI brief", "Invite verified talent", "Set up Google Meet", "Create project milestones"],
      });
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

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 512,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    req.log.error({ err }, "chatSummary error");
    res.status(500).json({ error: "Failed to summarize conversation" });
  }
});

export default router;
