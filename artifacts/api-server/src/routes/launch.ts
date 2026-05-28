import { Router, type Response } from "express";
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled, missingAzureOpenAiEnvVars } from "../lib/openai.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { CreateLaunchSessionBody, ScopeLaunchSessionBody } from "@workspace/api-zod";

const router = Router();

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

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateLaunchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { rawIdea, projectTitle } = parsed.data;

  if (!requireAzureOpenAi(res)) {
    return;
  }

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
    const parsedQuestions: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      throw new Error("Azure OpenAI returned invalid questions payload");
    }

    const questionsList = parsedQuestions
      .map((question) => String(question).trim())
      .filter(Boolean);

    const session = await LaunchSession.create({
      userId: req.userId,
      rawIdea,
      projectTitle,
      status: "clarifying",
    });

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
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate launch questions");
  }
});

router.post("/:id/scope", requireAuth, async (req: AuthRequest, res) => {
  const parsed = ScopeLaunchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  if (!requireAzureOpenAi(res)) {
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
    const brief = JSON.parse(cleaned);

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
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to scope launch session");
  }
});

export default router;
