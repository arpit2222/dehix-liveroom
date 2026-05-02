import { useState } from "react";
import { useLocation } from "wouter";
import { useScopeProject, useCreateRoom } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

interface ScopedBrief {
  projectTitle: string;
  projectSummary: string;
  estimatedWeeks: number;
  complexity: string;
  roles: Array<{ roleTitle: string; skillDomain: string; requiredLevel: number; minReputation: number; estimatedHours: number }>;
  milestones: Array<{ title: string; description: string; durationWeeks: number }>;
  technicalRisks: string[];
  suggestedTotalBudgetUsd: number;
}

export default function CreateRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [description, setDescription] = useState("");
  const [brief, setBrief] = useState<ScopedBrief | null>(null);
  const [error, setError] = useState("");

  const scope = useScopeProject({
    mutation: {
      onSuccess: (data: any) => setBrief(data),
      onError: (err: any) => setError(err?.data?.error ?? "AI scoping failed"),
    },
  });

  const createRoom = useCreateRoom({
    mutation: {
      onSuccess: (data: any) => navigate(`/room/${data._id}`),
      onError: (err: any) => setError(err?.data?.error ?? "Failed to create room"),
    },
  });

  if (!isAuthenticated || user?.role !== "business") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Business account required</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/business/dashboard")} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Dashboard
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">New Live Room</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Open a Live Room</h1>
          <p className="text-muted-foreground">Describe your project in plain English. Our AI will scope the work, define roles, and suggest milestones.</p>
        </div>

        {!brief ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: Build a cross-chain DeFi yield aggregator that automatically rebalances positions across Ethereum, Arbitrum, and Optimism. Need smart contract security, a React dashboard, and a ZK-proof privacy layer. Budget around $80k, timeline 10-12 weeks."
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none p-6 outline-none text-base leading-relaxed min-h-[200px]"
                rows={8}
              />
              <div className="border-t border-border/40 px-6 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{description.length} chars</span>
                <Button
                  onClick={() => { setError(""); scope.mutate({ data: { description } }); }}
                  disabled={scope.isPending || description.trim().length < 20}
                >
                  {scope.isPending ? "Scoping with AI..." : "Scope with AI"}
                </Button>
              </div>
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-xs text-primary font-medium uppercase tracking-wider mb-1">AI Project Scope</div>
                  <h2 className="text-xl font-bold">{brief.projectTitle}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{brief.projectSummary}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">Est. Budget</div>
                  <div className="text-lg font-bold text-foreground font-mono">
                    ${brief.suggestedTotalBudgetUsd?.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">{brief.estimatedWeeks}w · {brief.complexity}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Roles ({brief.roles?.length})</div>
                  <div className="space-y-1.5">
                    {brief.roles?.map((r, i) => (
                      <div key={i} className="text-xs bg-background/50 rounded px-2.5 py-1.5 border border-border/40">
                        <div className="font-medium text-foreground truncate">{r.roleTitle}</div>
                        <div className="text-muted-foreground truncate">{r.skillDomain}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Milestones ({brief.milestones?.length})</div>
                  <div className="space-y-1.5">
                    {brief.milestones?.map((m, i) => (
                      <div key={i} className="text-xs bg-background/50 rounded px-2.5 py-1.5 border border-border/40">
                        <div className="font-medium text-foreground truncate">{m.title}</div>
                        <div className="text-muted-foreground">{m.durationWeeks}w</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Risks</div>
                  <div className="space-y-1.5">
                    {brief.technicalRisks?.slice(0, 4).map((r, i) => (
                      <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded px-2.5 py-1.5 text-destructive/80 leading-tight">
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
            )}

            <div className="flex items-center gap-3">
              <Button
                className="flex-1 glow-purple"
                onClick={() => createRoom.mutate({ data: { title: brief.projectTitle, rawDescription: description } })}
                disabled={createRoom.isPending}
              >
                {createRoom.isPending ? "Creating room..." : "Open Live Room"}
              </Button>
              <Button variant="outline" onClick={() => setBrief(null)}>
                Re-scope
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
