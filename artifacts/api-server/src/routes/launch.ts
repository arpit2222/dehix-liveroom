import { Router, type Response } from "express";
import mongoose from "mongoose";
import { azureOpenai, azureOpenAiDeployment, isAzureOpenAiEnabled, missingAzureOpenAiEnvVars } from "../lib/openai.js";
import {
  getOrCreateBusinessBlueprintPdf,
  getOrCreateBusinessValidationPdf,
  warmBusinessBlueprintPdf,
  warmBusinessValidationPdf,
} from "../lib/reportPdfCache.js";
import { TECH_MANDATORY_QUESTIONS, getMandatoryQuestion } from "../lib/launchQuestions.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { SbtCredential } from "../models/SbtCredential.js";
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

function cleanJsonContent(content: string): string {
  return content.replace(/```json\n?|\n?```/g, "").trim();
}

function parseAzureJson<T>(content: string): T {
  return JSON.parse(cleanJsonContent(content)) as T;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

function parseStoredJson<T>(value?: string): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
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

function stringifyBlueprintValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not available";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function humanizeBlueprintKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function addBlueprintLines(
  lines: Array<{ text: string; size?: number; gapAfter?: number }>,
  value: unknown,
  label?: string,
  depth = 0
) {
  if (value === null || value === undefined) {
    if (label) {
      lines.push({ text: `${label}: Not available` });
    }
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    lines.push({ text: label ? `${label}: ${String(value)}` : String(value) });
    return;
  }

  if (Array.isArray(value)) {
    if (label) {
      lines.push({ text: label, size: depth === 0 ? 15 : 13, gapAfter: 6 });
    }
    if (value.length === 0) {
      lines.push({ text: "Not available." });
      return;
    }
    for (const item of value) {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        lines.push({ text: `- ${String(item)}` });
      } else {
        addBlueprintLines(lines, item, undefined, depth + 1);
        lines.push({ text: "", gapAfter: 4 });
      }
    }
    return;
  }

  if (typeof value === "object") {
    if (label) {
      lines.push({ text: label, size: depth === 0 ? 15 : 13, gapAfter: 6 });
    }
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const nestedLabel = humanizeBlueprintKey(key);
      if (typeof nestedValue === "object" && nestedValue !== null) {
        addBlueprintLines(lines, nestedValue, nestedLabel, depth + 1);
      } else {
        lines.push({ text: `${nestedLabel}: ${stringifyBlueprintValue(nestedValue)}` });
      }
    }
  }
}

function formatBusinessBlueprintLines(blueprint: any): Array<{ text: string; size?: number; gapAfter?: number }> {
  const lines: Array<{ text: string; size?: number; gapAfter?: number }> = [];
  const preferredOrder = [
    "executive_summary",
    "problem_definition",
    "target_users",
    "product_strategy",
    "mvp_definition",
    "user_journey",
    "technical_architecture",
    "security_and_compliance",
    "development_roadmap",
    "team_requirements",
    "cost_estimation",
    "business_model",
    "go_to_market",
    "risk_analysis",
    "founder_recommendations",
    "final_verdict",
    "next_options",
  ];

  for (const key of preferredOrder) {
    if (blueprint?.[key] !== undefined) {
      addBlueprintLines(lines, blueprint[key], humanizeBlueprintKey(key));
      lines.push({ text: "", gapAfter: 10 });
    }
  }

  for (const [key, value] of Object.entries(blueprint ?? {})) {
    if (!preferredOrder.includes(key) && key !== "step") {
      addBlueprintLines(lines, value, humanizeBlueprintKey(key));
      lines.push({ text: "", gapAfter: 10 });
    }
  }

  return lines;
}

function validateMandatoryAnswers(answers: Array<{ questionId: string; answer: string }>): string[] {
  return TECH_MANDATORY_QUESTIONS
    .filter((question) => {
      const answer = answers.find((item) => item.questionId === question._id)?.answer?.trim();
      return !answer;
    })
    .map((question) => question._id);
}

async function persistDynamicAnswers(sessionId: mongoose.Types.ObjectId, answers: Array<{ questionId: string; answer: string }>) {
  for (const ans of answers) {
    if (mongoose.Types.ObjectId.isValid(ans.questionId)) {
      await LaunchClarification.findOneAndUpdate({ _id: ans.questionId, sessionId }, { answer: ans.answer });
    }
  }
}

async function buildTechnicalAnswersText(sessionId: mongoose.Types.ObjectId, answers: Array<{ questionId: string; answer: string }>) {
  const dynamicClarifications = await LaunchClarification.find({ sessionId }).sort({ orderIndex: 1 });
  const dynamicById = new Map(dynamicClarifications.map((question) => [String(question._id), question]));

  return answers
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
}

type RecommendationRole = {
  roleTitle: string;
  skillDomain: string;
  requiredLevel: 1 | 2;
  minReputation: number;
  responsibilities: string[];
  estimatedHours: number;
};

function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textFromUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map(textFromUnknown).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(textFromUnknown).join(" ");
  return "";
}

function inferSkillDomain(text: string): string {
  const normalized = text.toLowerCase();
  const skillHints: Array<[string[], string]> = [
    [["solidity", "smart contract", "evm", "defi", "web3"], "Solidity / Smart Contracts"],
    [["react", "frontend", "front-end", "dashboard", "ui"], "React / Frontend"],
    [["node", "backend", "api", "server", "express"], "Node.js / Backend"],
    [["zk", "zero knowledge", "cryptography", "proof"], "ZK Proofs / Cryptography"],
    [["ai", "openai", "machine learning", "ml", "llm"], "AI / Machine Learning"],
    [["mobile", "ios", "android", "react native"], "Mobile Development"],
    [["design", "ux", "figma", "product designer"], "Product Design / UX"],
    [["cloud", "devops", "aws", "deployment", "infrastructure"], "Cloud / DevOps"],
  ];

  for (const [needles, label] of skillHints) {
    if (needles.some((needle) => normalized.includes(needle))) return label;
  }
  return "Full Stack Product Development";
}

function parseMoneyValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of ["expected", "high_end", "minimum", "max", "budget", "mvp_budget"]) {
      const parsed = parseMoneyValue(obj[key]);
      if (parsed) return parsed;
    }
    return parseMoneyValue(textFromUnknown(value));
  }
  if (typeof value !== "string") return undefined;

  const normalized = value.toLowerCase().replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|lakh|lac)?/g)];
  const amounts = matches
    .map((match) => {
      const raw = Number(match[1]);
      if (!Number.isFinite(raw)) return 0;
      const suffix = match[2];
      if (suffix === "k") return raw * 1000;
      if (suffix === "m") return raw * 1000000;
      if (suffix === "lakh" || suffix === "lac") return raw * 100000;
      return raw;
    })
    .filter((amount) => amount >= 100);

  return amounts.length > 0 ? Math.max(...amounts) : undefined;
}

function extractBudgetUsd(blueprint: any): number | undefined {
  return parseMoneyValue(blueprint?.cost_estimation?.mvp_budget)
    ?? parseMoneyValue(blueprint?.cost_estimation)
    ?? parseMoneyValue(blueprint?.budget)
    ?? undefined;
}

function extractRecommendationRoles(blueprint: any): RecommendationRole[] {
  const recommendedTeam = Array.isArray(blueprint?.team_requirements?.recommended_team)
    ? blueprint.team_requirements.recommended_team
    : [];

  const roles = recommendedTeam.map((role: any, index: number) => {
    const roleTitle = String(role?.role ?? role?.roleTitle ?? `Role ${index + 1}`);
    const roleText = [roleTitle, role?.skillDomain, textFromUnknown(role?.responsibilities)].join(" ");
    return {
      roleTitle,
      skillDomain: String(role?.skillDomain ?? inferSkillDomain(roleText)),
      requiredLevel: role?.requiredLevel === 2 ? 2 : 1,
      minReputation: Number(role?.minReputation ?? 500),
      responsibilities: asStringArray(role?.responsibilities).slice(0, 4),
      estimatedHours: Number(role?.estimatedHours ?? 120),
    } as RecommendationRole;
  });

  if (roles.length > 0) return roles;

  const fallbackText = textFromUnknown(blueprint);
  return [{
    roleTitle: "MVP Builder",
    skillDomain: inferSkillDomain(fallbackText),
    requiredLevel: 1,
    minReputation: 500,
    responsibilities: ["Build the first usable version", "Work from the generated blueprint"],
    estimatedHours: 160,
  }];
}

function skillSimilarity(requiredSkill: string, actualSkill: string): number {
  const required = requiredSkill.toLowerCase();
  const actual = actualSkill.toLowerCase();
  if (required === actual) return 100;
  if (required.includes(actual) || actual.includes(required)) return 90;

  const requiredTokens = required.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const actualTokens = new Set(actual.split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  if (requiredTokens.length === 0) return 40;
  const shared = requiredTokens.filter((token) => actualTokens.has(token)).length;
  return clampScore((shared / requiredTokens.length) * 85, 25, 85);
}

function estimateHourlyRateUsd(credential: any): number {
  const reputation = Number(credential.reputationScore ?? 0) / 1000;
  const github = Number(credential.githubScore ?? 0) / 100;
  const projects = Number(credential.projectsCompleted ?? 0);
  const levelBoost = credential.level === 2 ? 18 : 6;
  return Math.round(Math.max(18, Math.min(140, 24 + levelBoost + reputation * 42 + github * 18 + projects * 1.4)));
}

function calculateBudgetFitScore(projectBudgetUsd: number | undefined, estimatedCostUsd: number, roleCount: number): number {
  if (!projectBudgetUsd || projectBudgetUsd <= 0) return 72;
  const roleBudget = projectBudgetUsd / Math.max(roleCount, 1);
  if (estimatedCostUsd <= roleBudget) return 100;
  if (estimatedCostUsd <= roleBudget * 1.15) return 86;
  if (estimatedCostUsd <= roleBudget * 1.35) return 72;
  const overageRatio = estimatedCostUsd / roleBudget;
  return clampScore(72 - (overageRatio - 1.35) * 55, 20, 72);
}

function calculateTalentRecommendation(role: RecommendationRole, credential: any, projectBudgetUsd: number | undefined, roleCount: number) {
  const user = credential.userId as any;
  const reputationScore = clampScore((Number(credential.reputationScore ?? 0) / 1000) * 100);
  const openSourceScore = clampScore(Number(credential.githubScore ?? 0));
  const previousWorkScore = clampScore(Number(credential.projectsCompleted ?? 0) * 7 + Number(credential.interviewScore ?? 0) * 0.35);
  const talentScore = clampScore(reputationScore * 0.4 + previousWorkScore * 0.3 + openSourceScore * 0.3);
  const skillMatchScore = skillSimilarity(role.skillDomain, credential.skillDomain);
  const availabilityScore = user?.isOnline === false ? 45 : 95;
  const levelScore = credential.level >= role.requiredLevel ? 100 : 55;
  const estimatedHourlyRateUsd = estimateHourlyRateUsd(credential);
  const estimatedProjectCostUsd = estimatedHourlyRateUsd * role.estimatedHours;
  const budgetFitScore = calculateBudgetFitScore(projectBudgetUsd, estimatedProjectCostUsd, roleCount);
  const finalScore = clampScore(
    talentScore * 0.4 + skillMatchScore * 0.25 + budgetFitScore * 0.2 + availabilityScore * 0.1 + levelScore * 0.05
  );

  const reasons = [
    `${skillMatchScore}% skill match for ${role.skillDomain}`,
    `${reputationScore}% reputation strength from verified credentials`,
    `${openSourceScore}% open-source signal from GitHub score`,
    `${previousWorkScore}% previous-work signal from completed projects and interview score`,
  ];
  if (projectBudgetUsd) {
    reasons.push(`${budgetFitScore}% budget fit against the estimated role budget`);
  }
  if (user?.isOnline !== false) {
    reasons.push("Currently available on the platform");
  }

  return {
    talentId: user?._id,
    user: {
      _id: user?._id,
      name: user?.name ?? "Unknown talent",
      email: user?.email ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      walletAddress: user?.walletAddress ?? null,
      isOnline: user?.isOnline ?? false,
    },
    matchedRole: role,
    credential: {
      _id: credential._id,
      skillDomain: credential.skillDomain,
      level: credential.level,
      reputationScore: credential.reputationScore,
      githubScore: credential.githubScore,
      interviewScore: credential.interviewScore,
      projectsCompleted: credential.projectsCompleted,
      status: credential.status,
    },
    finalScore,
    scoreBreakdown: {
      talentScore,
      skillMatchScore,
      budgetFitScore,
      availabilityScore,
      openSourceScore,
      previousWorkScore,
      reputationScore,
    },
    estimatedHourlyRateUsd,
    estimatedProjectCostUsd,
    reasons,
  };
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
    const session = await LaunchSession.create({
      userId: req.userId,
      rawIdea,
      projectTitle: projectTitle || rawIdea.slice(0, 90),
      status: "generating",
      phase1Status: "generating",
      phase2Status: "queued",
    });

    res.status(202).json({ session, phase1Status: "generating" });

    void (async () => {
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
    session.projectTitle = String(titleSource).slice(0, 90);
    session.status = "reviewing";
    session.summaryText = analysis?.idea_summary;
    session.researchText = JSON.stringify(analysis);
    session.phase1Status = "ready";
    session.phase1Error = undefined;
    await session.save();
    warmBusinessValidationPdf(session);

      } catch (err) {
        req.log.error({ err, launchSessionId: session._id }, "Azure OpenAI failed to validate business idea");
        await LaunchSession.findByIdAndUpdate(session._id, {
          status: "draft",
          phase1Status: "failed",
          phase1Error: errorMessage(err),
        });
      }
    })();
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to validate business idea");
  }
});

router.get("/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({
      session,
      phase1Status: session.phase1Status ?? (session.researchText ? "ready" : "queued"),
      phase1Error: session.phase1Error,
      phase2Status: session.phase2Status ?? (session.technicalDocText ? "ready" : "queued"),
      phase2Error: session.phase2Error,
      analysis: parseStoredJson<any>(session.researchText),
      blueprint: parseStoredJson<any>(session.technicalDocText),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch launch session status");
    res.status(500).json({ error: "Failed to fetch launch session status" });
  }
});

router.get("/:id/business-validation.pdf", requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const pdf = await getOrCreateBusinessValidationPdf(session);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="business-validation-${session._id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "Failed to generate business validation PDF");
    res.status(500).json({ error: "Failed to generate business validation PDF" });
  }
});

async function handleTechnicalQuestions(req: AuthRequest, res: Response) {
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

    if (!isAzureOpenAiEnabled) {
      res.json({
        mandatoryQuestions: TECH_MANDATORY_QUESTIONS,
        optionalQuestions: [],
        optionalQuestionError: "Azure OpenAI is not configured",
      });
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

    try {
      const completion = await azureOpenai.chat.completions.create({
        model: azureOpenAiDeployment,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1024,
      });

      const parsedQuestions = parseAzureJson<unknown>(completion.choices[0]?.message?.content ?? "[]");
      const rawQuestions = Array.isArray(parsedQuestions)
        ? parsedQuestions
        : Array.isArray((parsedQuestions as any)?.questions)
          ? (parsedQuestions as any).questions
          : [];
      const questionsList = asStringArray(rawQuestions).slice(0, 4);

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
      req.log.error({ err }, "Azure OpenAI failed to generate optional technical questions");
      res.json({
        mandatoryQuestions: TECH_MANDATORY_QUESTIONS,
        optionalQuestions: [],
        optionalQuestionError: "Optional AI questions could not be generated",
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch technical questions");
    res.status(500).json({ error: "Failed to fetch technical questions" });
  }
}

router.get("/:id/technical-questions", requireAuth, handleTechnicalQuestions);
router.post("/:id/technical-questions", requireAuth, handleTechnicalQuestions);
router.post("/:id/blueprint", requireAuth, async (req: AuthRequest, res) => {
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

    const missingMandatory = validateMandatoryAnswers(parsed.data.answers);
    if (missingMandatory.length > 0) {
      res.status(400).json({ error: "Please answer all mandatory technical questions" });
      return;
    }

    await persistDynamicAnswers(session._id as mongoose.Types.ObjectId, parsed.data.answers);
    const technicalAnswersText = await buildTechnicalAnswersText(session._id as mongoose.Types.ObjectId, parsed.data.answers);
    const businessAnalysis = session.researchText ? JSON.parse(session.researchText) : {};

    session.technicalAnswersText = technicalAnswersText;
    session.phase2Status = "generating";
    session.phase2Error = undefined;
    session.status = "generating";
    await session.save();

    res.status(202).json({ session, phase2Status: "generating" });

    void (async () => {
      try {
    const blueprintSystemPrompt = `You are DEHIX_Business_Development_Blueprint_Generator version 1.0.

Assistant identity:
Senior Product Strategist, Startup Consultant, CTO, Solution Architect, Technical Lead, and Business Analyst.

Purpose:
Generate a complete business and development blueprint before software development begins.

Tone:
Professional, practical, execution-focused, realistic, and brutally honest.

Mission:
- Use the validated business idea analysis.
- Use all mandatory business answers.
- Use all optional dynamic answers.
- Convert them into a complete execution blueprint.
- Act as an experienced founder, CTO, investor, product manager, and architect simultaneously.
- Help the founder understand exactly what should be built, why it should be built, how it should be built, how much it may cost, and what risks exist.

Critical rules:
- Never generate generic startup advice.
- Never write vague recommendations.
- Every recommendation must directly relate to the provided business idea.
- If assumptions are made, clearly mark them.
- Provide realistic estimates, not optimistic estimates.
- Prefer simplicity over unnecessary complexity.
- Recommend MVP-first development.
- Avoid overengineering.
- Explain business reasoning and technical reasoning separately.
- Return ONLY valid JSON. No markdown, no intro text.`;

    const userPrompt = `Mandatory inputs:

Business analysis from Phase 1:
${JSON.stringify(businessAnalysis, null, 2)}

Original business idea:
${session.rawIdea}

Mandatory and optional Phase 2 answers:
${technicalAnswersText}

Return this exact JSON structure. Fill every field with concrete, idea-specific content:
{
  "step": "business_and_development_blueprint",
  "executive_summary": {
    "idea_name": "string",
    "one_line_description": "string",
    "business_goal": "string",
    "target_market": "string",
    "recommended_launch_strategy": "string"
  },
  "problem_definition": {
    "problem_statement": "string",
    "current_alternatives": ["string"],
    "why_existing_solutions_fail": ["string"]
  },
  "target_users": {
    "primary_users": [{ "persona": "string", "description": "string", "pain_points": ["string"], "goals": ["string"] }],
    "secondary_users": [{ "persona": "string", "description": "string" }]
  },
  "product_strategy": {
    "core_value_proposition": "string",
    "product_positioning": "string",
    "competitive_advantage": ["string"],
    "key_success_metrics": ["string"]
  },
  "mvp_definition": {
    "must_have_features": [{ "feature": "string", "purpose": "string", "priority": "Critical" }],
    "should_have_features": [{ "feature": "string", "purpose": "string" }],
    "future_features": [{ "feature": "string", "reason": "string" }],
    "excluded_from_mvp": ["string"]
  },
  "user_journey": {
    "onboarding_flow": ["string"],
    "main_user_flow": ["string"],
    "retention_flow": ["string"]
  },
  "technical_architecture": {
    "recommended_stack": {
      "frontend": "string",
      "backend": "string",
      "database": "string",
      "authentication": "string",
      "cloud": "string",
      "storage": "string",
      "ai_services": "string",
      "third_party_services": ["string"]
    },
    "system_components": [{ "component": "string", "purpose": "string" }],
    "api_modules": ["string"],
    "database_entities": ["string"]
  },
  "security_and_compliance": {
    "security_requirements": ["string"],
    "privacy_requirements": ["string"],
    "compliance_requirements": ["string"]
  },
  "development_roadmap": {
    "phase_1_discovery": { "duration": "string", "deliverables": ["string"] },
    "phase_2_design": { "duration": "string", "deliverables": ["string"] },
    "phase_3_mvp_development": { "duration": "string", "deliverables": ["string"] },
    "phase_4_testing": { "duration": "string", "deliverables": ["string"] },
    "phase_5_launch": { "duration": "string", "deliverables": ["string"] }
  },
  "team_requirements": {
    "recommended_team": [{ "role": "string", "responsibilities": ["string"] }],
    "minimum_team": ["string"]
  },
  "cost_estimation": {
    "mvp_budget": { "minimum": "string", "expected": "string", "high_end": "string" },
    "monthly_operational_cost": { "minimum": "string", "expected": "string", "high_end": "string" },
    "major_cost_drivers": ["string"]
  },
  "business_model": {
    "primary_revenue_streams": ["string"],
    "secondary_revenue_streams": ["string"],
    "pricing_strategy": "string"
  },
  "go_to_market": {
    "launch_channels": ["string"],
    "customer_acquisition_strategy": ["string"],
    "early_growth_strategy": ["string"]
  },
  "risk_analysis": {
    "business_risks": [{ "risk": "string", "mitigation": "string" }],
    "technical_risks": [{ "risk": "string", "mitigation": "string" }],
    "market_risks": [{ "risk": "string", "mitigation": "string" }]
  },
  "founder_recommendations": {
    "before_building": ["string"],
    "during_development": ["string"],
    "before_launch": ["string"]
  },
  "final_verdict": {
    "build_now_or_not": "Build Now | Validate Further | Not Recommended",
    "reasoning": "string",
    "mvp_confidence_score": "number 0-10"
  }
}`;

    const completion = await azureOpenai.chat.completions.create({
      model: azureOpenAiDeployment,
      messages: [
        { role: "system", content: blueprintSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 8192,
    });

    const blueprint = parseAzureJson<any>(completion.choices[0]?.message?.content ?? "{}");
    session.technicalDocText = JSON.stringify(blueprint);
    session.status = "reviewing";
    session.phase2Status = "ready";
    session.phase2Error = undefined;
    await session.save();
    warmBusinessBlueprintPdf(session);

      } catch (err) {
        req.log.error({ err, launchSessionId: session._id }, "Azure OpenAI failed to generate business development blueprint");
        await LaunchSession.findByIdAndUpdate(session._id, {
          status: "reviewing",
          phase2Status: "failed",
          phase2Error: errorMessage(err),
        });
      }
    })();
  } catch (err) {
    sendAzureOpenAiError(req, res, err, "Azure OpenAI failed to generate business development blueprint");
  }
});


router.post("/:id/talent-recommendations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!session.technicalDocText) {
      res.status(400).json({ error: "Generate the blueprint before talent recommendations" });
      return;
    }

    const blueprint = JSON.parse(session.technicalDocText);
    const roles = extractRecommendationRoles(blueprint).slice(0, 8);
    const budgetUsd = extractBudgetUsd(blueprint);
    const credentials = await SbtCredential.find({ status: "verified" })
      .populate("userId", "name email avatarUrl walletAddress isOnline role createdAt")
      .sort({ reputationScore: -1 })
      .limit(250);

    const candidates = credentials
      .filter((credential: any) => {
        const user = credential.userId as any;
        return user?.role === "talent";
      })
      .flatMap((credential: any) => roles.map((role) => calculateTalentRecommendation(role, credential, budgetUsd, roles.length)))
      .filter((candidate: any) => candidate.talentId && candidate.scoreBreakdown.skillMatchScore >= 35)
      .sort((a: any, b: any) => b.finalScore - a.finalScore);

    const diversified = new Map<string, any>();
    for (const candidate of candidates) {
      const key = `${candidate.talentId}:${candidate.matchedRole.roleTitle}`;
      if (!diversified.has(key)) diversified.set(key, candidate);
    }

    const recommendations = [...diversified.values()].slice(0, 12);
    const payload = {
      step: "talent_recommendations",
      budgetUsd: budgetUsd ?? null,
      roleCount: roles.length,
      roles,
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    session.businessDocText = JSON.stringify(payload);
    await session.save();
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Failed to recommend talent");
    res.status(500).json({ error: "Failed to recommend talent" });
  }
});
router.get("/:id/business-blueprint.pdf", requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await LaunchSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!session.technicalDocText) {
      res.status(404).json({ error: "Blueprint report has not been generated yet" });
      return;
    }

    const pdf = await getOrCreateBusinessBlueprintPdf(session);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="business-blueprint-${session._id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "Failed to generate business blueprint PDF");
    res.status(500).json({ error: "Failed to generate business blueprint PDF" });
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
    session.technicalAnswersText = technicalAnswersText;

    const businessAnalysis = session.researchText ? JSON.parse(session.researchText) : {};
    const businessBlueprint = session.technicalDocText ? JSON.parse(session.technicalDocText) : null;
    const talentRecommendationReport = session.businessDocText ? JSON.parse(session.businessDocText) : null;
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
      launchSessionId: session._id,
      title: brief?.projectTitle || session.projectTitle || "New Project",
      rawDescription: fullDescription,
      aiScopedBrief: {
        ...brief,
        launchSessionId: String(session._id),
        businessValidation: businessAnalysis,
        businessBlueprint,
        talentRecommendations: talentRecommendationReport?.recommendations ?? [],
        talentRecommendationBudgetUsd: talentRecommendationReport?.budgetUsd ?? null,
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
