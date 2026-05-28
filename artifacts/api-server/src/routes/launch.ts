import { Router, type Response } from "express";
import mongoose from "mongoose";
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled, missingAzureOpenAiEnvVars } from "../lib/openai.js";
import { buildSimplePdf } from "../lib/simplePdf.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { CreateLaunchSessionBody, ScopeLaunchSessionBody } from "@workspace/api-zod";

const router = Router();

const TECH_MANDATORY_QUESTIONS = [
  {
    _id: "primary_user_goal",
    question: "Who will use this product first, and what is the main thing they should be able to do on day one?",
    required: true,
  },
  {
    _id: "first_platform",
    question: "Where should the first version launch: web app, mobile app, admin dashboard, API, or something else?",
    required: true,
  },
  {
    _id: "must_have_features",
    question: "What are the top 3 must-have features for the first usable version?",
    required: true,
  },
  {
    _id: "accounts_payments_data",
    question: "Will the product need user accounts, payments, file uploads, chat, maps, AI, blockchain, or third-party integrations?",
    required: true,
  },
  {
    _id: "constraints",
    question: "Do you have any fixed timeline, budget range, compliance needs, or existing tools/data that the team must work with?",
    required: true,
  },
];

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

function cleanJsonContent(content: string): string {
  return content.replace(/```json\n?|\n?```/g, "").trim();
}

function parseAzureJson<T>(content: string): T {
  return JSON.parse(cleanJsonContent(content)) as T;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function getMandatoryQuestion(questionId: string) {
  return TECH_MANDATORY_QUESTIONS.find((question) => question._id === questionId);
}

function formatBusinessValidationLines(analysis: any): Array<{ text: string; size?: number; gapAfter?: number }> {
  const research = analysis?.research_analysis ?? {};
  const scores = research?.dimensional_scores ?? {};
  const lines: Array<{ text: string; size?: number; gapAfter?: number }> = [
    { text: "Idea Summary", size: 15, gapAfter: 6 },
    { text: analysis?.idea_summary ?? "No summary provided." },
    { text: `Region Used: ${analysis?.region_used ?? "Not specified"}` },
    { text: `Final Verdict: ${research?.final_verdict ?? "Not available"}`, size: 14, gapAfter: 6 },
    { text: `Overall Score: ${research?.overall_score ?? "N/A"} / 10` },
    { text: research?.verdict_reasoning ?? "No verdict reasoning provided.", gapAfter: 14 },
    { text: "Market and Audience", size: 15, gapAfter: 6 },
    { text: `Market Demand: ${research?.market_demand ?? "Not available"}` },
    { text: `Target Audience: ${research?.target_audience ?? "Not available"}` },
    { text: `Competitor Analysis: ${research?.competitor_analysis ?? "Not available"}` },
    { text: `Competitive Moat: ${research?.competitive_moat ?? "Not available"}`, gapAfter: 14 },
    { text: "Business Model", size: 15, gapAfter: 6 },
    { text: `Revenue Model: ${research?.revenue_model ?? "Not available"}` },
    { text: `Unit Economics: ${research?.unit_economics ?? "Not available"}` },
    { text: `Cost Estimation: ${research?.cost_estimation ?? "Not available"}` },
    { text: `Go To Market: ${research?.go_to_market_strategy ?? "Not available"}`, gapAfter: 14 },
    { text: "Scores", size: 15, gapAfter: 6 },
    { text: `Market Opportunity: ${scores?.market_opportunity ?? "N/A"} / 10` },
    { text: `Problem Clarity: ${scores?.problem_clarity ?? "N/A"} / 10` },
    { text: `Solution Differentiation: ${scores?.solution_differentiation ?? "N/A"} / 10` },
    { text: `Execution Feasibility: ${scores?.execution_feasibility ?? "N/A"} / 10` },
    { text: `Revenue Potential: ${scores?.revenue_potential ?? "N/A"} / 10`, gapAfter: 14 },
  ];

  const listSections = [
    ["Risks", asStringArray(research?.risks)],
    ["Suggestions", asStringArray(research?.suggestions)],
    ["Assumptions", asStringArray(research?.assumptions)],
    ["Strengths", asStringArray(research?.swot?.strengths)],
    ["Weaknesses", asStringArray(research?.swot?.weaknesses)],
    ["Opportunities", asStringArray(research?.swot?.opportunities)],
    ["Threats", asStringArray(research?.swot?.threats)],
  ] as const;

  for (const [heading, items] of listSections) {
    lines.push({ text: heading, size: 15, gapAfter: 6 });
    if (items.length === 0) {
      lines.push({ text: "Not available." });
    } else {
      for (const item of items) {
        lines.push({ text: `- ${item}` });
      }
    }
    lines.push({ text: "", gapAfter: 8 });
  }

  return lines;
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
    const prompt = `You are DEHIX_Idea_Analysis_JSON_Prompt.

Purpose:
Step A: analyze and research the user's business idea. Do not generate technical documentation. Do not select actual freelancers.

Assistant identity:
Senior AI business strategist, startup advisor, product manager, and market analyst inside a freelancing platform where businesses validate ideas and then hire freelancers.

Tone:
Professional, direct, practical, evidence-aware, and honest.

Workflow:
1. Check whether the idea is clear enough.
2. If vague, ask up to 3 targeted clarifying questions.
3. If clear, perform region-specific idea analysis.
4. Return two next options so the frontend can show buttons.

Rules:
- Ask clarification questions only when the idea is vague.
- Ask only impactful questions about target user, core problem, region, budget, or business model.
- Score each dimension from 0 to 10.
- Be critical. Most ideas should score between 4 and 7. Reserve 8+ only for genuinely strong ideas.
- Use practical market reasoning. If exact research is unavailable, state the assumption instead of inventing facts.
- Return ONLY valid JSON. No markdown, no intro text.

Dimensional scoring weights:
- market_opportunity: 0.25
- problem_clarity: 0.15
- solution_differentiation: 0.20
- execution_feasibility: 0.20
- revenue_potential: 0.20

User business idea:
${rawIdea}

Return this exact JSON structure:
{
  "step": "analysis",
  "needs_clarification": boolean,
  "clarifying_questions": ["string"],
  "region_used": "string",
  "idea_summary": "string",
  "research_analysis": {
    "market_demand": "string",
    "target_audience": "string",
    "competitor_analysis": "string",
    "competitive_moat": "string",
    "revenue_model": "string",
    "unit_economics": "string",
    "cost_estimation": "string",
    "go_to_market_strategy": "string",
    "risks": ["3 to 6 specific risks"],
    "suggestions": ["3 to 6 actionable suggestions"],
    "assumptions": ["string"],
    "swot": {
      "strengths": ["string"],
      "weaknesses": ["string"],
      "opportunities": ["string"],
      "threats": ["string"]
    },
    "dimensional_scores": {
      "market_opportunity": number,
      "problem_clarity": number,
      "solution_differentiation": number,
      "execution_feasibility": number,
      "revenue_potential": number
    },
    "overall_score": number,
    "final_verdict": "Viable | Needs Work | Not Recommended",
    "verdict_reasoning": "string"
  },
  "next_options": [
    { "id": "download_pdf", "label": "Download validation PDF" },
    { "id": "continue_technical", "label": "Continue to technical questions" }
  ]
}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
    });

    const analysis = parseAzureJson<any>(completion.choices[0]?.message?.content ?? "{}");
    const titleSource = analysis?.idea_summary || projectTitle || rawIdea;
    const session = await LaunchSession.create({
      userId: req.userId,
      rawIdea,
      projectTitle: String(titleSource).slice(0, 90),
      status: "reviewing",
      summaryText: analysis?.idea_summary,
      researchText: JSON.stringify(analysis),
    });

    res.status(201).json({ session, analysis });
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to validate business idea");
  }
});

router.get("/:id/business-validation.pdf", requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const analysis = session.researchText ? JSON.parse(session.researchText) : {};
    const pdf = buildSimplePdf(
      `${session.projectTitle || "Business Idea"} - Business Validation Report`,
      formatBusinessValidationLines(analysis)
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="business-validation-${session._id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "Failed to generate business validation PDF");
    res.status(500).json({ error: "Failed to generate business validation PDF" });
  }
});

router.post("/:id/technical-questions", requireAuth, async (req: AuthRequest, res) => {
  if (!requireAzureOpenAi(res)) {
    return;
  }

  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const existing = await LaunchClarification.find({ sessionId: session._id }).sort({ orderIndex: 1 });
    if (existing.length > 0) {
      res.json({ mandatoryQuestions: TECH_MANDATORY_QUESTIONS, optionalQuestions: existing });
      return;
    }

    const analysis = session.researchText ? JSON.parse(session.researchText) : {};
    const prompt = `You are a senior product manager preparing simple technical discovery questions for a non-technical business owner.

Business idea:
${session.rawIdea}

Business validation summary:
${analysis?.idea_summary ?? "No summary available"}

Generate 3 optional follow-up questions that change according to this business idea.
The questions must be easy to answer, practical, and not overly technical.
Focus on what the development team must know before building.
Do not repeat these mandatory topics:
- first users and day-one goal
- launch platform
- top must-have features
- accounts/payments/data/integrations
- timeline, budget, compliance, existing assets

Return ONLY a valid JSON array of strings.`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
    });

    const parsedQuestions = parseAzureJson<unknown>(completion.choices[0]?.message?.content ?? "[]");
    const questionsList = asStringArray(parsedQuestions).slice(0, 4);

    const optionalQuestions = await Promise.all(
      questionsList.map((question, index) =>
        LaunchClarification.create({
          sessionId: session._id,
          question,
          orderIndex: index,
        })
      )
    );

    res.json({ mandatoryQuestions: TECH_MANDATORY_QUESTIONS, optionalQuestions });
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate technical questions");
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
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const missingMandatory = TECH_MANDATORY_QUESTIONS.filter((question) => {
      const answer = parsed.data.answers.find((item) => item.questionId === question._id)?.answer?.trim();
      return !answer;
    });
    if (missingMandatory.length > 0) {
      res.status(400).json({ error: "Please answer all mandatory technical questions" });
      return;
    }

    for (const ans of parsed.data.answers) {
      if (mongoose.Types.ObjectId.isValid(ans.questionId)) {
        await LaunchClarification.findByIdAndUpdate(ans.questionId, { answer: ans.answer });
      }
    }

    const dynamicClarifications = await LaunchClarification.find({ sessionId: session._id }).sort({ orderIndex: 1 });
    const dynamicById = new Map(dynamicClarifications.map((question) => [String(question._id), question]));

    const technicalAnswersText = parsed.data.answers
      .map((answer) => {
        const mandatory = getMandatoryQuestion(answer.questionId);
        const dynamic = dynamicById.get(answer.questionId);
        const questionText = mandatory?.question ?? dynamic?.question;
        if (!questionText || !answer.answer.trim()) {
          return null;
        }
        return `Q: ${questionText}\nA: ${answer.answer.trim()}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const businessAnalysis = session.researchText ? JSON.parse(session.researchText) : {};
    const fullDescription = `Original Idea:\n${session.rawIdea}

Business Validation:
${JSON.stringify(businessAnalysis, null, 2)}

Technical Intake Answers:
${technicalAnswersText}`;

    const prompt = `You are a senior project manager and solution architect. A business idea has already been validated. Use the validation and technical intake answers to create the live room dashboard data.

Return ONLY valid JSON. No markdown, no explanation.

${fullDescription}

Rules:
- Keep feature scope realistic for the first usable version.
- Tickets must be practical development tasks.
- Milestones must map to build phases.
- Roles should describe team needs, not actual freelancer names.
- Use non-technical language in descriptions where possible.

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
      "minReputation": number,
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

    const brief = parseAzureJson<any>(completion.choices[0]?.message?.content ?? "{}");
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = await LiveRoom.create({
      roomCode,
      businessId: req.userId,
      title: brief?.projectTitle || session.projectTitle || "New Project",
      rawDescription: fullDescription,
      aiScopedBrief: {
        ...brief,
        businessValidation: businessAnalysis,
      },
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
