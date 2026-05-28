import { Router } from "express";
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled } from "../lib/openai.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { CreateLaunchSessionBody, ScopeLaunchSessionBody } from "@workspace/api-zod";

const router = Router();

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateLaunchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { rawIdea, projectTitle } = parsed.data;

  try {
    const session = await LaunchSession.create({
      userId: req.userId,
      rawIdea,
      projectTitle,
      status: "clarifying",
    });

    let questionsList: string[] = [
      "Who is the target audience for this project?",
      "Are you looking to build an MVP or a full-scale product?",
      "What is your rough budget for this project?",
      "What is the expected timeline for delivery?",
    ];

    if (isAzureOpenAiEnabled) {
      try {
        const prompt = `You are a technical project manager taking in a raw idea for a Web3 or AI project.
Read the client's raw idea and output exactly 4 highly-relevant clarifying questions to help define the scope better.
DO NOT include any markdown, intro text, or numbering. Return a pure JSON array of strings.

Idea: "${rawIdea}"

Expected format:
["Question 1?", "Question 2?", "Question 3?", "Question 4?"]`;

        const completion = await azureOpenai.chat.completions.create({
          model: azureOpenAiDeployment,
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 1024,
        });

        const content = completion.choices[0]?.message?.content ?? "[]";
        const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
        try {
          questionsList = JSON.parse(cleaned);
        } catch (e) {
          req.log.warn({ e, content }, "Failed to parse AI questions array, using fallbacks");
        }
      } catch (err) {
        req.log.error({ err }, "Azure OpenAI generate questions failed, using fallback");
      }
    }

    const clarifications = await Promise.all(
      questionsList.slice(0, 5).map((q, i) =>
        LaunchClarification.create({
          sessionId: session._id,
          question: q,
          orderIndex: i,
        })
      )
    );

    res.status(201).json({ session, questions: clarifications });
  } catch (err) {
    req.log.error({ err }, "createLaunchSession error");
    res.status(500).json({ error: "Failed to create launch session" });
  }
});

router.post("/:id/scope", requireAuth, async (req: AuthRequest, res) => {
  const parsed = ScopeLaunchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  try {
    const session = await LaunchSession.findById(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    for (const ans of parsed.data.answers) {
      await LaunchClarification.findByIdAndUpdate(ans.questionId, { answer: ans.answer });
    }

    const updatedClarifications = await LaunchClarification.find({ sessionId: session._id }).sort({ orderIndex: 1 });

    const clarificationsText = updatedClarifications
      .map((c) => `Q: ${c.question}\nA: ${c.answer || "N/A"}`)
      .join("\n\n");

    const fullDescription = `Original Idea: ${session.rawIdea}\n\nClarifications:\n${clarificationsText}`;

    let brief = null;

    if (isAzureOpenAiEnabled) {
      try {
        const prompt = `You are a senior Web3 project manager. A client has described a project and answered clarifying questions. Extract and return ONLY valid JSON — no markdown, no explanation.

${fullDescription}

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
        brief = JSON.parse(cleaned);
      } catch (err) {
        req.log.error({ err }, "Azure OpenAI generate scope failed, using fallback");
        // @ts-ignore
        const mockAi = await import("../lib/mockAi.js");
        brief = mockAi.mockScope(fullDescription);
      }
    } else {
      // @ts-ignore
      const mockAi = await import("../lib/mockAi.js");
      brief = mockAi.mockScope(fullDescription);
    }

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = await LiveRoom.create({
      roomCode,
      businessId: req.userId,
      title: brief?.projectTitle || session.projectTitle || "New Project",
      rawDescription: fullDescription,
      aiScopedBrief: brief,
      status: "scoping",
    });

    session.status = "approved";
    await session.save();

    res.json(room);
  } catch (err) {
    req.log.error({ err }, "scopeLaunchSession error");
    res.status(500).json({ error: "Failed to scope launch session" });
  }
});

export default router;
