import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type WizardPhase = "idea" | "analysis" | "technical" | "blueprint" | "recommendations";

type Question = {
  _id: string;
  question: string;
  required?: boolean;
};

type AnalysisResult = {
  needs_clarification?: boolean;
  clarifying_questions?: string[];
  region_used?: string;
  idea_summary?: string;
  research_analysis?: {
    market_demand?: string;
    target_audience?: string;
    competitor_analysis?: string;
    competitive_moat?: string;
    revenue_model?: string;
    unit_economics?: string;
    cost_estimation?: string;
    go_to_market_strategy?: string;
    risks?: string[];
    suggestions?: string[];
    assumptions?: string[];
    swot?: {
      strengths?: string[];
      weaknesses?: string[];
      opportunities?: string[];
      threats?: string[];
    };
    dimensional_scores?: Record<string, number>;
    overall_score?: number;
    final_verdict?: string;
    verdict_reasoning?: string;
  };
};

type BlueprintResult = Record<string, unknown>;

type TalentRecommendation = {
  talentId: string;
  user: {
    _id: string;
    name: string;
    email?: string | null;
    avatarUrl?: string | null;
    walletAddress?: string | null;
    isOnline?: boolean;
  };
  matchedRole: {
    roleTitle: string;
    skillDomain: string;
    requiredLevel: 1 | 2;
    minReputation: number;
    estimatedHours: number;
  };
  credential: {
    skillDomain: string;
    level: 1 | 2;
    reputationScore: number;
    githubScore: number;
    interviewScore: number;
    projectsCompleted: number;
  };
  finalScore: number;
  scoreBreakdown: {
    talentScore: number;
    skillMatchScore: number;
    budgetFitScore: number;
    availabilityScore: number;
    openSourceScore: number;
    previousWorkScore: number;
    reputationScore: number;
  };
  estimatedHourlyRateUsd: number;
  estimatedProjectCostUsd: number;
  reasons: string[];
};

type TalentRecommendationReport = {
  budgetUsd?: number | null;
  roleCount: number;
  recommendations: TalentRecommendation[];
};

const EXAMPLE_PROMPTS = [
  "A platform that helps small restaurants predict daily ingredient demand, reduce food waste, and auto-create purchase lists for suppliers.",
  "A marketplace where local fitness coaches can sell short video programs, manage paid communities, and track client progress.",
  "An AI assistant for real estate agents that qualifies leads, writes listing descriptions, schedules visits, and keeps client follow-ups organized.",
];

const SCORE_LABELS: Record<string, string> = {
  market_opportunity: "Market opportunity",
  problem_clarity: "Problem clarity",
  solution_differentiation: "Differentiation",
  execution_feasibility: "Execution feasibility",
  revenue_potential: "Revenue potential",
};

const FALLBACK_MANDATORY_QUESTIONS: Question[] = [
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
const BLUEPRINT_SECTION_ORDER = [
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

function getToken() {
  return localStorage.getItem("dehix_token");
}

async function readApiError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("dehix_token");
    localStorage.removeItem("dehix_user");
    window.dispatchEvent(new Event("dehix:auth-cleared"));
  }
  return data?.error ?? fallback;
}

function humanizeKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPrimitive(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatPrimitive(value: unknown) {
  if (value === null || value === undefined) return "Not available";
  return String(value);
}

function formatCurrency(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "Budget not found";
  return `$${Math.round(value).toLocaleString()}`;
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3 text-xs mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="text-sm text-muted-foreground leading-relaxed flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlueprintValue({ value }: { value: unknown }): ReactNode {
  if (isPrimitive(value)) {
    return <p className="text-sm text-muted-foreground leading-relaxed">{formatPrimitive(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-muted-foreground">Not available</p>;
    }

    if (value.every(isPrimitive)) {
      return (
        <ul className="space-y-1.5">
          {value.map((item, index) => (
            <li key={index} className="text-sm text-muted-foreground leading-relaxed flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>{formatPrimitive(item)}</span>
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border border-border/40 bg-background/35 p-3">
            <BlueprintValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => (
          <div key={key} className="space-y-1 rounded-lg border border-border/40 bg-background/35 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{humanizeKey(key)}</h4>
            <BlueprintValue value={nestedValue} />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function BlueprintReport({ blueprint }: { blueprint: BlueprintResult }) {
  const orderedSections = BLUEPRINT_SECTION_ORDER
    .filter((key) => blueprint[key] !== undefined)
    .map((key) => [key, blueprint[key]] as const);
  const remainingSections = Object.entries(blueprint).filter(
    ([key]) => !BLUEPRINT_SECTION_ORDER.includes(key) && key !== "step"
  );

  return (
    <div className="space-y-5">
      {[...orderedSections, ...remainingSections].map(([key, value]) => (
        <section key={key} className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold">{humanizeKey(key)}</h2>
          <BlueprintValue value={value} />
        </section>
      ))}
    </div>
  );
}

export default function CreateRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  const [phase, setPhase] = useState<WizardPhase>("idea");
  const [description, setDescription] = useState("");
  const [sessionData, setSessionData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null);
  const [mandatoryQuestions, setMandatoryQuestions] = useState<Question[]>([]);
  const [optionalQuestions, setOptionalQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingBlueprint, setGeneratingBlueprint] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingBlueprintPdf, setDownloadingBlueprintPdf] = useState(false);
  const [talentRecommendationReport, setTalentRecommendationReport] = useState<TalentRecommendationReport | null>(null);

  if (!isAuthenticated || user?.role !== "business") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Business account required</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  const validateIdea = async () => {
    if (!description.trim() || description.length < 20 || validating) return;
    setValidating(true);
    setError("");
    try {
      const title = description.trim().slice(0, 60) + (description.length > 60 ? "..." : "");
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ rawIdea: description.trim(), projectTitle: title }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Azure OpenAI failed to analyze the business idea"));
      }
      const data = await res.json();
      setSessionData(data.session);
      setAnalysis(data.analysis);
      setBlueprint(null);
      setPhase("analysis");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to analyze idea";
      setError(msg);
      toast.error(msg);
    } finally {
      setValidating(false);
    }
  };

  const downloadValidationPdf = async () => {
    if (!sessionData?._id || downloadingPdf) return;
    setDownloadingPdf(true);
    setError("");
    try {
      const res = await fetch(`/api/launch/${sessionData._id}/business-validation.pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to download analysis PDF"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `business-analysis-${sessionData._id}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to download analysis PDF";
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const downloadBlueprintPdf = async () => {
    if (!sessionData?._id || downloadingBlueprintPdf) return;
    setDownloadingBlueprintPdf(true);
    setError("");
    try {
      const res = await fetch(`/api/launch/${sessionData._id}/business-blueprint.pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to download blueprint PDF"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `business-blueprint-${sessionData._id}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to download blueprint PDF";
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloadingBlueprintPdf(false);
    }
  };

  const loadTechnicalQuestions = async () => {
    if (!sessionData?._id || loadingQuestions) return;
    setLoadingQuestions(true);
    setError("");
    setMandatoryQuestions(FALLBACK_MANDATORY_QUESTIONS);
    setOptionalQuestions([]);
    try {
      const res = await fetch(`/api/launch/${sessionData._id}/technical-questions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Azure OpenAI failed to prepare technical questions"));
      }
      const data = await res.json();
      const fetchedMandatoryQuestions = Array.isArray(data.mandatoryQuestions) && data.mandatoryQuestions.length > 0
        ? data.mandatoryQuestions
        : FALLBACK_MANDATORY_QUESTIONS;
      setMandatoryQuestions(fetchedMandatoryQuestions);
      setOptionalQuestions(Array.isArray(data.optionalQuestions) ? data.optionalQuestions : []);
      if (data.optionalQuestionError) {
        toast.warning(data.optionalQuestionError);
      }
      setPhase("technical");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to prepare technical questions";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const generateBlueprint = async () => {
    if (!sessionData?._id || generatingBlueprint) return;
    const missing = mandatoryQuestions.filter((question) => !answers[question._id]?.trim());
    if (missing.length > 0) {
      toast.error("Please answer all mandatory questions");
      return;
    }

    setGeneratingBlueprint(true);
    setError("");
    try {
      const allQuestions = [...mandatoryQuestions, ...optionalQuestions];
      const answersPayload = allQuestions
        .map((question) => ({
          questionId: question._id,
          answer: answers[question._id]?.trim() ?? "",
        }))
        .filter((item) => item.answer);

      const res = await fetch(`/api/launch/${sessionData._id}/blueprint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ answers: answersPayload }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Azure OpenAI failed to generate the blueprint"));
      }
      const data = await res.json();
      setBlueprint(data.blueprint ?? null);
      if (data.session) {
        setSessionData(data.session);
      }
      setPhase("blueprint");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to generate blueprint";
      setError(msg);
      toast.error(msg);
    } finally {
      setGeneratingBlueprint(false);
    }
  };


  const generateTalentRecommendations = async () => {
    if (!sessionData?._id || loadingRecommendations) return;
    setLoadingRecommendations(true);
    setError("");
    try {
      const res = await fetch(`/api/launch/${sessionData._id}/talent-recommendations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to generate talent recommendations"));
      }
      const data = await res.json();
      setTalentRecommendationReport({
        budgetUsd: data.budgetUsd ?? null,
        roleCount: data.roleCount ?? 0,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      });
      setPhase("recommendations");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to generate talent recommendations";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingRecommendations(false);
    }
  };
  const enterRoomDashboard = async () => {
    if (!sessionData?._id || creatingRoom) return;
    const missing = mandatoryQuestions.filter((question) => !answers[question._id]?.trim());
    if (missing.length > 0) {
      toast.error("Please answer all mandatory questions");
      setPhase("technical");
      return;
    }

    setCreatingRoom(true);
    setError("");
    try {
      const allQuestions = [...mandatoryQuestions, ...optionalQuestions];
      const answersPayload = allQuestions
        .map((question) => ({
          questionId: question._id,
          answer: answers[question._id]?.trim() ?? "",
        }))
        .filter((item) => item.answer);

      const res = await fetch(`/api/launch/${sessionData._id}/scope`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ answers: answersPayload }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Azure OpenAI failed to create the room dashboard"));
      }
      const room = await res.json();
      navigate(`/room/${room._id}`);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to enter room dashboard";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreatingRoom(false);
    }
  };
  const research = analysis?.research_analysis;
  const scores = research?.dimensional_scores ?? {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/business/dashboard")} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Back to dashboard
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">New Live Room</span>
          {sessionData?.projectTitle && (
            <>
              <span className="text-border">/</span>
              <span className="text-sm text-muted-foreground truncate max-w-[240px]">{sessionData.projectTitle}</span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 grid gap-2 text-xs sm:grid-cols-4">
          {[
            ["idea", "1", "Idea input"],
            ["analysis", "1", "Business analysis"],
            ["technical", "2", "Blueprint report"],
            ["recommendations", "3", "Talent matches"],
          ].map(([key, number, label]) => {
            const active = phase === key || (phase === "blueprint" && key === "technical");
            return (
              <div
                key={key}
                className={`rounded-lg border px-3 py-2 ${
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/40 bg-card/40 text-muted-foreground"
                }`}
              >
                <span className="font-mono mr-2">{number}</span>
                {label}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        {phase === "idea" && (
          <div className="space-y-6">
            <div>
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Phase 1</div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Analyze the business idea first</h1>
              <p className="text-muted-foreground max-w-2xl">
                Describe the idea in normal language. Azure OpenAI will only analyze the business side here: market, audience,
                competitors, revenue, risks, score, and verdict.
              </p>
            </div>

            <div className="rounded-xl border border-border/50 bg-card overflow-hidden focus-within:border-primary/40 transition-colors">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Example: I want to build a platform for local restaurants to predict demand and reduce ingredient waste..."
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/40 resize-none p-6 outline-none text-base leading-relaxed min-h-[190px]"
                rows={7}
              />
              <div className="border-t border-border/40 px-6 py-3 flex items-center justify-between gap-3">
                <span className={`text-xs ${description.length < 20 ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                  {description.length} chars {description.length < 20 && description.length > 0 ? "- add more detail" : ""}
                </span>
                <Button onClick={validateIdea} disabled={validating || description.trim().length < 20} className="glow-purple">
                  {validating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                      Analyzing...
                    </span>
                  ) : "Analyze business"}
                </Button>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground/60 mb-2 uppercase tracking-wider font-medium">Try an example</div>
              <div className="grid gap-2">
                {EXAMPLE_PROMPTS.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setDescription(prompt)}
                    className="w-full text-left text-xs text-muted-foreground/70 hover:text-muted-foreground border border-border/30 hover:border-border/60 rounded-lg px-4 py-3 transition-all leading-relaxed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === "analysis" && analysis && (
          <div className="space-y-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Phase 1 output</div>
                <h1 className="text-3xl font-bold tracking-tight mb-3">Business analysis result</h1>
                <p className="text-muted-foreground max-w-2xl">{analysis.idea_summary}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setPhase("idea")} disabled={loadingQuestions || downloadingPdf}>
                  Edit idea
                </Button>
                <Button variant="outline" onClick={downloadValidationPdf} disabled={downloadingPdf}>
                  {downloadingPdf ? "Preparing..." : "Download PDF"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Verdict</div>
                <div className="text-xl font-semibold">{research?.final_verdict ?? "Not available"}</div>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{research?.verdict_reasoning}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overall score</div>
                <div className="text-3xl font-bold font-mono text-primary">{research?.overall_score ?? "N/A"}</div>
                <div className="text-xs text-muted-foreground mt-1">out of 10</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Region</div>
                <div className="text-lg font-semibold">{analysis.region_used ?? "Not specified"}</div>
                {analysis.needs_clarification && (
                  <p className="text-xs text-amber-400 mt-2">AI marked this idea as needing more clarity.</p>
                )}
              </div>
            </div>

            {analysis.needs_clarification && analysis.clarifying_questions && analysis.clarifying_questions.length > 0 && (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-4">
                <h3 className="text-sm font-semibold text-amber-300 mb-2">Clarifying questions from AI</h3>
                <ul className="space-y-1.5">
                  {analysis.clarifying_questions.map((question, index) => (
                    <li key={index} className="text-sm text-amber-100/80">{index + 1}. {question}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
                <h2 className="font-semibold">Market view</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.market_demand}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.target_audience}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.competitor_analysis}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
                <h2 className="font-semibold">Business model</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.revenue_model}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.unit_economics}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{research?.cost_estimation}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h2 className="font-semibold mb-4">Dimensional scores</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="rounded-lg border border-border/40 bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground mb-1">{label}</div>
                    <div className="text-xl font-semibold font-mono">{scores[key] ?? "N/A"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <SectionList title="Risks" items={research?.risks} />
              <SectionList title="Suggestions" items={research?.suggestions} />
              <SectionList title="Strengths" items={research?.swot?.strengths} />
              <SectionList title="Weaknesses" items={research?.swot?.weaknesses} />
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border/40">
              <Button className="flex-1 glow-purple h-12 text-base" onClick={loadTechnicalQuestions} disabled={loadingQuestions}>
                {loadingQuestions ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Preparing questions...
                  </span>
                ) : "Move to technical questions"}
              </Button>
            </div>
          </div>
        )}

        {phase === "technical" && (
          <div className="space-y-8">
            <div>
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Phase 2 intake</div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Answer blueprint questions</h1>
              <p className="text-muted-foreground max-w-2xl">
                The fixed questions are mandatory. The optional questions are generated from the business idea and make the final blueprint more specific.
              </p>
            </div>

            <div className="space-y-6">
              {mandatoryQuestions.map((question, index) => (
                <div key={question._id} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {index + 1}. {question.question} <span className="text-primary">*</span>
                  </label>
                  <textarea
                    value={answers[question._id] || ""}
                    onChange={(event) => setAnswers({ ...answers, [question._id]: event.target.value })}
                    placeholder="Answer in plain language..."
                    className="w-full bg-card text-foreground placeholder:text-muted-foreground/40 resize-none p-4 rounded-xl border border-border/50 outline-none text-sm focus:border-primary/40 transition-colors min-h-[92px]"
                  />
                </div>
              ))}

              {optionalQuestions.length > 0 && (
                <div className="pt-4 border-t border-border/40 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Optional AI questions</h2>
                    <p className="text-xs text-muted-foreground mt-1">These are based on your specific idea. Answer the ones you can.</p>
                  </div>
                  {optionalQuestions.map((question, index) => (
                    <div key={question._id} className="space-y-2">
                      <label className="text-sm font-medium text-foreground">{index + 1}. {question.question}</label>
                      <textarea
                        value={answers[question._id] || ""}
                        onChange={(event) => setAnswers({ ...answers, [question._id]: event.target.value })}
                        placeholder="Optional answer..."
                        className="w-full bg-card text-foreground placeholder:text-muted-foreground/40 resize-none p-4 rounded-xl border border-border/50 outline-none text-sm focus:border-primary/40 transition-colors min-h-[92px]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border/40">
              <Button variant="outline" className="h-12" onClick={() => setPhase("analysis")} disabled={generatingBlueprint}>
                Back
              </Button>
              <Button className="flex-1 glow-purple h-12 text-base" onClick={generateBlueprint} disabled={generatingBlueprint}>
                {generatingBlueprint ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Generating blueprint...
                  </span>
                ) : "Generate phase 2 report"}
              </Button>
            </div>
          </div>
        )}

        {phase === "blueprint" && blueprint && (
          <div className="space-y-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Phase 2 output</div>
                <h1 className="text-3xl font-bold tracking-tight mb-3">Business and development blueprint</h1>
                <p className="text-muted-foreground max-w-2xl">
                  This report uses the Phase 1 analysis plus the mandatory and optional Phase 2 answers.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setPhase("technical")} disabled={downloadingBlueprintPdf || creatingRoom || loadingRecommendations}>
                  Edit answers
                </Button>
                <Button variant="outline" onClick={downloadBlueprintPdf} disabled={downloadingBlueprintPdf || creatingRoom || loadingRecommendations}>
                  {downloadingBlueprintPdf ? "Preparing..." : "Download PDF"}
                </Button>
                <Button variant="outline" onClick={enterRoomDashboard} disabled={creatingRoom || loadingRecommendations}>
                  {creatingRoom ? "Preparing room..." : "Skip matches"}
                </Button>
                <Button className="glow-purple" onClick={generateTalentRecommendations} disabled={loadingRecommendations || creatingRoom}>
                  {loadingRecommendations ? "Finding talent..." : "Generate phase 3 matches"}
                </Button>
              </div>
            </div>

            <BlueprintReport blueprint={blueprint} />
          </div>
        )}

        {phase === "recommendations" && talentRecommendationReport && (
          <div className="space-y-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Phase 3 output</div>
                <h1 className="text-3xl font-bold tracking-tight mb-3">Recommended talent for this budget</h1>
                <p className="text-muted-foreground max-w-2xl">
                  Candidates are ranked using verified reputation, previous work, GitHub score, skill fit, availability, and budget fit.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setPhase("blueprint")} disabled={creatingRoom || loadingRecommendations}>
                  Back to blueprint
                </Button>
                <Button variant="outline" onClick={generateTalentRecommendations} disabled={loadingRecommendations || creatingRoom}>
                  {loadingRecommendations ? "Refreshing..." : "Refresh matches"}
                </Button>
                <Button className="glow-purple" onClick={enterRoomDashboard} disabled={creatingRoom || loadingRecommendations}>
                  {creatingRoom ? "Preparing room..." : "Enter room dashboard"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Detected MVP budget</div>
                <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(talentRecommendationReport.budgetUsd)}</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Roles considered</div>
                <div className="text-2xl font-bold font-mono">{talentRecommendationReport.roleCount}</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recommended talents</div>
                <div className="text-2xl font-bold font-mono">{talentRecommendationReport.recommendations.length}</div>
              </div>
            </div>

            {talentRecommendationReport.recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                <h2 className="font-semibold mb-2">No verified talent matched yet</h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  The room can still be created. Once more verified talent credentials exist, this phase will rank them automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {talentRecommendationReport.recommendations.map((recommendation, index) => (
                  <div key={`${recommendation.talentId}-${recommendation.matchedRole.roleTitle}-${index}`} className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                          <span className="text-primary font-bold">{recommendation.user.name?.[0]?.toUpperCase() ?? "T"}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-semibold truncate">{recommendation.user.name}</h2>
                            <span className={`text-[10px] rounded border px-2 py-0.5 ${recommendation.user.isOnline ? "border-emerald-800/40 bg-emerald-950/30 text-emerald-400" : "border-border/50 bg-background/50 text-muted-foreground"}`}>
                              {recommendation.user.isOnline ? "Available" : "Offline"}
                            </span>
                          </div>
                          <p className="text-sm text-primary mt-1">{recommendation.matchedRole.roleTitle} - {recommendation.credential.skillDomain}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            L{recommendation.credential.level} - {recommendation.credential.reputationScore} rep - {recommendation.credential.projectsCompleted} completed projects - GitHub {recommendation.credential.githubScore}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-left md:text-right">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Final score</div>
                        <div className="text-3xl font-bold font-mono text-primary">{recommendation.finalScore}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ${recommendation.estimatedHourlyRateUsd}/hr - {formatCurrency(recommendation.estimatedProjectCostUsd)} est.
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <ScorePill label="Talent score" value={recommendation.scoreBreakdown.talentScore} />
                      <ScorePill label="Skill match" value={recommendation.scoreBreakdown.skillMatchScore} />
                      <ScorePill label="Budget fit" value={recommendation.scoreBreakdown.budgetFitScore} />
                      <ScorePill label="Previous work" value={recommendation.scoreBreakdown.previousWorkScore} />
                      <ScorePill label="Open source" value={recommendation.scoreBreakdown.openSourceScore} />
                      <ScorePill label="Availability" value={recommendation.scoreBreakdown.availabilityScore} />
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {recommendation.reasons.slice(0, 6).map((reason, reasonIndex) => (
                        <div key={reasonIndex} className="rounded-lg border border-border/30 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
