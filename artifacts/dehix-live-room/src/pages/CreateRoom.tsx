import { useState } from "react";
import { useLocation } from "wouter";
import { useScopeProject, useCreateRoom } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ScopedBrief {
  projectTitle: string;
  projectSummary: string;
  estimatedWeeks: number;
  complexity: string;
  recommendedStack?: string;
  roles: Array<{ roleTitle: string; skillDomain: string; requiredLevel: number; minReputation: number; estimatedHours: number }>;
  milestones: Array<{ title: string; description: string; durationWeeks: number }>;
  technicalRisks: string[];
  suggestedTotalBudgetUsd: number;
}

const EXAMPLE_PROMPTS = [
  "Build a cross-chain DeFi yield aggregator that rebalances positions across Ethereum, Arbitrum, and Optimism. Need smart contract security, a React dashboard, and a ZK-proof privacy layer. Budget ~$80k, 10-12 weeks.",
  "Create a Web3 social platform where creators can tokenize their content as NFTs. Users can subscribe with tokens, tip in ETH, and creators get 90% revenue. React Native mobile app + Solana smart contracts.",
  "Build an AI-powered hiring platform for DAOs — talent creates on-chain reputation, businesses post bounties, AI matches and scores candidates. Full-stack with IPFS storage and multi-sig escrow payments.",
];

export default function CreateRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [description, setDescription] = useState("");
  const [brief, setBrief] = useState<ScopedBrief | null>(null);
  const [error, setError] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);

  const scope = useScopeProject({
    mutation: {
      onSuccess: (data: any) => { setBrief(data); setError(""); },
      onError: (err: any) => {
        const msg = err?.data?.error ?? "AI scoping failed — try a more detailed description";
        setError(msg);
        toast.error(msg);
      },
    },
  });

  const createRoom = useCreateRoom({
    mutation: {
      onSuccess: async (data: any) => {
        if (brief && data._id) {
          setSavingBrief(true);
          try {
            const token = localStorage.getItem("dehix_token");
            await fetch(`/api/rooms/${data._id}/brief`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ brief }),
            });
          } catch (_) {}
          setSavingBrief(false);
        }
        navigate(`/room/${data._id}`);
      },
      onError: (err: any) => setError(err?.data?.error ?? "Failed to create room"),
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

  const isPending = createRoom.isPending || savingBrief;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/business/dashboard")} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            ← Dashboard
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">New Live Room</span>
          {brief && (
            <>
              <span className="text-border">/</span>
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">{brief.projectTitle}</span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {!brief ? (
          <>
            <div className="mb-10">
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Step 1 of 2</div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Describe your project</h1>
              <p className="text-muted-foreground max-w-xl">
                Write in plain English. Our AI will scope the work, define team roles, suggest milestones, estimate budget, and surface technical risks.
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
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!description.trim()) return;
                        const title = description.trim().slice(0, 60) + (description.length > 60 ? "..." : "");
                        createRoom.mutate({ data: { title, rawDescription: description } });
                      }}
                      disabled={scope.isPending || createRoom.isPending || description.trim().length < 5}
                    >
                      Quick Create
                    </Button>
                    <Button
                      onClick={() => { setError(""); scope.mutate({ data: { description } }); }}
                      disabled={scope.isPending || createRoom.isPending || description.trim().length < 20}
                      className="glow-purple"
                    >
                      {scope.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                          Scoping with AI...
                        </span>
                      ) : "Scope with AI →"}
                    </Button>
                  </div>
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
        ) : (
          <div className="space-y-6">
            <div className="mb-8">
              <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">Step 2 of 2 — Review AI Scope</div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">{brief.projectTitle}</h1>
              <p className="text-muted-foreground">{brief.projectSummary}</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
                <div className="text-2xl font-bold font-mono">{brief.estimatedWeeks}w</div>
                <div className="text-xs text-muted-foreground mt-0.5">Timeline</div>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 text-center">
                <div className="text-2xl font-bold font-mono text-emerald-400">${brief.suggestedTotalBudgetUsd?.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Estimated Budget</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${
                brief.complexity === "low" ? "border-emerald-800/40 bg-emerald-950/20" :
                brief.complexity === "medium" ? "border-amber-800/40 bg-amber-950/20" :
                "border-rose-800/40 bg-rose-950/20"
              }`}>
                <div className={`text-2xl font-bold capitalize ${
                  brief.complexity === "low" ? "text-emerald-400" :
                  brief.complexity === "medium" ? "text-amber-400" :
                  "text-rose-400"
                }`}>{brief.complexity}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Complexity</div>
              </div>
            </div>

            {brief.recommendedStack && (
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recommended Stack</div>
                <p className="text-sm text-muted-foreground">{brief.recommendedStack}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Roles ({brief.roles?.length})</div>
                <div className="space-y-1.5">
                  {brief.roles?.map((r, i) => (
                    <div key={i} className="text-xs bg-card rounded-lg px-3 py-2 border border-border/40">
                      <div className="font-medium text-foreground truncate">{r.roleTitle}</div>
                      <div className="text-primary truncate">{r.skillDomain}</div>
                      <div className="text-muted-foreground/60 font-mono">L{r.requiredLevel} · {r.estimatedHours}h</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Milestones ({brief.milestones?.length})</div>
                <div className="space-y-1.5">
                  {brief.milestones?.map((m, i) => (
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
                  {brief.technicalRisks?.slice(0, 5).map((r, i) => (
                    <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-destructive/80 leading-tight">
                      ⚠ {r}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                className="flex-1 glow-purple"
                onClick={() => createRoom.mutate({ data: { title: brief.projectTitle, rawDescription: description } })}
                disabled={isPending}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                    {savingBrief ? "Saving brief..." : "Creating room..."}
                  </span>
                ) : "Open Live Room →"}
              </Button>
              <Button variant="outline" onClick={() => { setBrief(null); setError(""); }}>
                Re-scope
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
