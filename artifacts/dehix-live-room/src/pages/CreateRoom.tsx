import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateLaunchSession, useScopeLaunchSession } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EXAMPLE_PROMPTS = [
  "Build a cross-chain DeFi yield aggregator that rebalances positions across Ethereum, Arbitrum, and Optimism. Need smart contract security, a React dashboard, and a ZK-proof privacy layer. Budget ~$80k, 10-12 weeks.",
  "Create a Web3 social platform where creators can tokenize their content as NFTs. Users can subscribe with tokens, tip in ETH, and creators get 90% revenue. React Native mobile app + Solana smart contracts.",
  "Build an AI-powered hiring platform for DAOs — talent creates on-chain reputation, businesses post bounties, AI matches and scores candidates. Full-stack with IPFS storage and multi-sig escrow payments.",
];

export default function CreateRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState("");
  const [sessionData, setSessionData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [roomData, setRoomData] = useState<any>(null);
  const [error, setError] = useState("");

  const createSession = useCreateLaunchSession({
    mutation: {
      onSuccess: (data: any) => {
        setSessionData(data);
        setError("");
        setStep(2);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? "Failed to initialize session. Please try again.";
        setError(msg);
        toast.error(msg);
      },
    },
  });

  const scopeSession = useScopeLaunchSession({
    mutation: {
      onSuccess: (data: any) => {
        setRoomData(data);
        setError("");
        setStep(3);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? "Failed to generate scope. Please try again.";
        setError(msg);
        toast.error(msg);
      },
    },
  });

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

  const handleStartClarification = () => {
    if (!description.trim() || description.length < 20) return;
    const title = description.trim().slice(0, 60) + (description.length > 60 ? "..." : "");
    createSession.mutate({ data: { rawIdea: description, projectTitle: title } });
  };

  const handleGenerateScope = () => {
    if (!sessionData) return;
    const answersArray = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));
    scopeSession.mutate({
      id: sessionData.session._id,
      data: { answers: answersArray },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/business/dashboard")} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            ← Dashboard
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">New Live Room</span>
          {sessionData?.session?.projectTitle && (
            <>
              <span className="text-border">/</span>
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">{sessionData.session.projectTitle}</span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* STEP 1: RAW IDEA */}
        {step === 1 && (
          <>
            <div className="mb-10">
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Step 1 of 3</div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Describe your project</h1>
              <p className="text-muted-foreground max-w-xl">
                Write your raw idea in plain English. Our AI will analyze it and ask a few clarifying questions before defining the scope.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden focus-within:border-primary/40 transition-colors">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Be specific about the tech stack, features, timeline, and budget..."
                  className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/40 resize-none p-6 outline-none text-base leading-relaxed min-h-[180px]"
                  rows={7}
                />
                <div className="border-t border-border/40 px-6 py-3 flex items-center justify-between gap-3">
                  <span className={`text-xs ${description.length < 20 ? "text-muted-foreground/40" : description.length > 1000 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {description.length} chars {description.length < 20 && description.length > 0 ? "— add more detail" : ""}
                  </span>
                  <Button
                    onClick={handleStartClarification}
                    disabled={createSession.isPending || description.trim().length < 20}
                    className="glow-purple"
                  >
                    {createSession.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                        Analyzing...
                      </span>
                    ) : "Next: Clarify Details →"}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div>
                <div className="text-xs text-muted-foreground/60 mb-2 uppercase tracking-wider font-medium">Try an example</div>
                <div className="space-y-2">
                  {EXAMPLE_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setDescription(p)}
                      className="w-full text-left text-xs text-muted-foreground/60 hover:text-muted-foreground border border-border/30 hover:border-border/60 rounded-lg px-4 py-3 transition-all leading-relaxed"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 2: CLARIFICATION */}
        {step === 2 && sessionData && (
          <div className="space-y-8">
            <div className="mb-8">
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Step 2 of 3</div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Let's refine the scope</h1>
              <p className="text-muted-foreground max-w-xl">
                The AI needs a bit more context to generate an accurate project brief, milestones, and team requirements.
              </p>
            </div>

            <div className="space-y-6">
              {sessionData.questions.map((q: any) => (
                <div key={q._id} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{q.question}</label>
                  <textarea
                    value={answers[q._id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [q._id]: e.target.value })}
                    placeholder="Provide more detail here..."
                    className="w-full bg-card text-foreground placeholder:text-muted-foreground/40 resize-none p-4 rounded-xl border border-border/50 outline-none text-sm focus:border-primary/40 transition-colors min-h-[100px]"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-border/40">
              <Button
                className="flex-1 glow-purple h-12 text-base"
                onClick={handleGenerateScope}
                disabled={scopeSession.isPending}
              >
                {scopeSession.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Generating Full Project Scope...
                  </span>
                ) : "Generate Project Plan →"}
              </Button>
              <Button variant="outline" className="h-12" onClick={() => setStep(1)} disabled={scopeSession.isPending}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW AI SCOPE */}
        {step === 3 && roomData?.aiScopedBrief && (
          <div className="space-y-6">
            <div className="mb-8">
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Step 3 of 3 — Ready to Build</div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">{roomData.aiScopedBrief.projectTitle}</h1>
              <p className="text-muted-foreground">{roomData.aiScopedBrief.projectSummary}</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
                <div className="text-2xl font-bold font-mono">{roomData.aiScopedBrief.estimatedWeeks}w</div>
                <div className="text-xs text-muted-foreground mt-0.5">Timeline</div>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 text-center">
                <div className="text-2xl font-bold font-mono text-emerald-400">${roomData.aiScopedBrief.suggestedTotalBudgetUsd?.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Estimated Budget</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${
                roomData.aiScopedBrief.complexity === "low" ? "border-emerald-800/40 bg-emerald-950/20" :
                roomData.aiScopedBrief.complexity === "medium" ? "border-amber-800/40 bg-amber-950/20" :
                "border-rose-800/40 bg-rose-950/20"
              }`}>
                <div className={`text-2xl font-bold capitalize ${
                  roomData.aiScopedBrief.complexity === "low" ? "text-emerald-400" :
                  roomData.aiScopedBrief.complexity === "medium" ? "text-amber-400" :
                  "text-rose-400"
                }`}>{roomData.aiScopedBrief.complexity}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Complexity</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Required Team Roles ({roomData.aiScopedBrief.roles?.length})</div>
                <div className="space-y-1.5">
                  {roomData.aiScopedBrief.roles?.map((r: any, i: number) => (
                    <div key={i} className="text-xs bg-card rounded-lg px-3 py-2 border border-border/40">
                      <div className="font-medium text-foreground truncate">{r.roleTitle}</div>
                      <div className="text-primary truncate">{r.skillDomain}</div>
                      <div className="text-muted-foreground/60 font-mono">L{r.requiredLevel} · {r.estimatedHours}h</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Milestones ({roomData.aiScopedBrief.milestones?.length})</div>
                <div className="space-y-1.5">
                  {roomData.aiScopedBrief.milestones?.map((m: any, i: number) => (
                    <div key={i} className="text-xs bg-card rounded-lg px-3 py-2 border border-border/40">
                      <div className="font-medium text-foreground truncate">{m.title}</div>
                      <div className="text-muted-foreground">{m.durationWeeks}w</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Risks</div>
                <div className="space-y-1.5">
                  {roomData.aiScopedBrief.technicalRisks?.slice(0, 5).map((r: string, i: number) => (
                    <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-destructive/80 leading-tight">
                      ⚠ {r}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border/40">
              <Button
                className="flex-1 glow-purple h-12 text-base"
                onClick={() => navigate(`/room/${roomData._id}`)}
              >
                Open Live Room →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
