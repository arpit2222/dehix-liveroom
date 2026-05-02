import { Router } from "express";
import { openai, isOpenAiEnabled } from "../lib/openai.js";
import { mockScope, mockChat, mockNda, mockMilestones } from "../lib/mockAi.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { Ticket } from "../models/Ticket.js";
import { Milestone } from "../models/Milestone.js";
import { User } from "../models/User.js";
import { SbtCredential } from "../models/SbtCredential.js";
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
      level: { $gte: requiredLevel },
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

    if (!isOpenAiEnabled) {
      res.json({ content: mockNda(room.title, business?.name ?? "Business", talentNames, milestoneList) });
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
    res.json({ content });
  } catch (err) {
    req.log.error({ err }, "generateNda error — falling back to mock");
    const room = await LiveRoom.findById(roomId).catch(() => null);
    res.json({ content: mockNda(room?.title ?? "Project", "Business", "", "") });
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

  if (!isOpenAiEnabled) {
    const room = await LiveRoom.findById(roomId).catch(() => null);
    res.json({ reply: mockChat(message, room?.title ?? "your project") });
    return;
  }

  try {
    const room = await LiveRoom.findById(roomId);
    const brief = room?.aiScopedBrief as any;

    const systemPrompt = `You are the DEHIX Live Room AI assistant helping a business and their Web3 development squad collaborate in real time.

Current room context:
- Project: ${room?.title ?? "Unknown"}
- Summary: ${brief?.projectSummary ?? "No brief yet"}
- Status: ${room?.status ?? "unknown"}

You help with: project scope questions, ticket/milestone splitting, Web3 market rate estimates, technical requirements, risk mitigations.
Be concise, direct, and technically accurate.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_completion_tokens: 512,
    });

    const reply = completion.choices[0]?.message?.content ?? "I couldn't process that request.";
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "aiChat error — falling back to mock");
    const room = await LiveRoom.findById(roomId).catch(() => null);
    res.json({ reply: mockChat(message, room?.title ?? "your project") });
  }
});

export default router;
