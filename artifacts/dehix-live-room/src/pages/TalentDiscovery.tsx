import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { ReputationRing } from "@/components/ReputationRing";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SKILL_DOMAINS = [
  "Solidity / Smart Contracts",
  "React / Frontend",
  "Node.js / Backend",
  "Rust / Systems",
  "ZK Proofs",
  "DevOps / Infrastructure",
  "Product Management",
  "UI/UX Design",
  "Security / Auditing",
];

export default function TalentDiscovery() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  const urlParams = new URLSearchParams(window.location.search);
  const initialSkill = urlParams.get("skill") ?? "";
  const initialMinRep = urlParams.get("minRep") ?? "0";

  const [skill, setSkill] = useState(initialSkill);
  const [minRep, setMinRep] = useState(initialMinRep);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteRoomId, setInviteRoomId] = useState("");
  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);

  const isBusiness = user?.role === "business";

  useEffect(() => {
    if (!isAuthenticated || !isBusiness) return;
    const token = localStorage.getItem("dehix_token");
    fetch("/api/rooms/my", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d.filter((r: any) => r.status !== "closed") : [];
        setMyRooms(list);
        if (list[0]) setInviteRoomId(list[0]._id);
      })
      .catch(() => {});
  }, [isAuthenticated, isBusiness]);

  const sendQuickInvite = async (talentUserId: string) => {
    if (!inviteRoomId) { toast.error("Select a room first"); return; }
    setInviteLoadingId(talentUserId);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${inviteRoomId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: talentUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to invite");
      toast.success(data.message ?? "Talent invited to room!");
      setInvitingId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to invite talent");
    } finally {
      setInviteLoadingId(null);
    }
  };

  useEffect(() => {
    if (initialSkill || Number(initialMinRep) > 0) {
      search(initialSkill, initialMinRep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (overrideSkill?: string, overrideMinRep?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const s = overrideSkill !== undefined ? overrideSkill : skill;
      const r = overrideMinRep !== undefined ? overrideMinRep : minRep;
      if (s) params.set("skill", s);
      if (Number(r) > 0) params.set("minRep", r);
      if (onlineOnly) params.set("onlineOnly", "true");
      params.set("limit", "30");
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/talent/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(Array.isArray(data) ? data : []);
      setSearched(true);
    } catch (e: any) {
      const msg = e.message ?? "Search failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1 as any)} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← Back
            </button>
            <span className="text-border/40">/</span>
            <span className="font-semibold text-sm">Talent Discovery</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Find Verified Talent</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse Web3 developers with verified SBT credentials and on-chain reputation scores
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-5 mb-8 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {SKILL_DOMAINS.slice(0, 6).map((s) => (
              <button
                key={s}
                onClick={() => {
                  const next = s === skill ? "" : s;
                  setSkill(next);
                  search(next, minRep);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${skill === s ? "bg-primary/20 border-primary/50 text-primary font-medium" : "border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
              >
                {s.split(" / ")[0]}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Skill Domain</label>
              <select
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="">All skills</option>
                {SKILL_DOMAINS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Min Reputation</label>
              <select
                value={minRep}
                onChange={(e) => setMinRep(e.target.value)}
                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:border-primary/50"
              >
                <option value="0">Any reputation</option>
                <option value="500">500+ (Trusted)</option>
                <option value="700">700+ (Highly Trusted)</option>
                <option value="850">850+ (Elite)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <div
                  onClick={() => setOnlineOnly(!onlineOnly)}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${onlineOnly ? "bg-green-600" : "bg-muted"}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${onlineOnly ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm text-muted-foreground">Online now</span>
              </label>
            </div>
          </div>
          <Button onClick={() => search()} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-white/40 border-t-white animate-spin" />
                Searching...
              </span>
            ) : "Search Talent"}
          </Button>
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{error}</div>
          )}
        </div>

        {!searched && !loading && (
          <div className="rounded-xl border border-dashed border-border/50 p-16 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <p className="font-medium text-foreground/70 mb-1">Search for verified Web3 talent</p>
            <p className="text-sm text-muted-foreground">
              Filter by skill domain, reputation threshold, or availability
            </p>
          </div>
        )}

        {searched && results.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/50 p-16 text-center">
            <p className="text-muted-foreground text-sm">No verified talent found matching your criteria</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Try broadening your search filters</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {results.length} verified developer{results.length !== 1 ? "s" : ""} found
                </span>
                <button
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border/40 hover:border-border/60 flex items-center gap-1"
                >
                  Rep {sortDir === "desc" ? "↓ High" : "↑ Low"}
                </button>
              </div>
              {isBusiness && myRooms.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Invite to:</span>
                  <select
                    value={inviteRoomId}
                    onChange={(e) => setInviteRoomId(e.target.value)}
                    className="bg-card border border-border/50 rounded px-2 py-1 text-xs outline-none focus:border-primary/50"
                  >
                    {myRooms.map((rm: any) => (
                      <option key={rm._id} value={rm._id}>{rm.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {[...results].sort((a, b) => sortDir === "desc" ? b.overallReputation - a.overallReputation : a.overallReputation - b.overallReputation).map((r) => (
              <div
                key={r.user._id}
                className="rounded-xl border border-border/50 bg-card hover:border-primary/30 transition-colors"
              >
                <button
                  onClick={() => navigate(`/talent/profile/${r.user._id}`)}
                  className="w-full text-left p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <ReputationRing score={r.overallReputation} size={52} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{r.user.name}</h3>
                          {r.user.isOnline && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Online" />
                          )}
                        </div>
                        <p className="text-xs text-primary font-medium">{r.primarySkill}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.credentials.length} credential{r.credentials.length !== 1 ? "s" : ""} verified</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold font-mono text-foreground">{r.overallReputation}</div>
                      <div className="text-[10px] text-muted-foreground">reputation</div>
                      <div className="flex flex-wrap gap-1 mt-2 justify-end">
                        {r.credentials.slice(0, 3).map((c: any) => (
                          <span
                            key={c._id}
                            className="text-[10px] border border-primary/30 bg-primary/5 text-primary rounded px-1.5 py-0.5"
                          >
                            {c.skillDomain.split(" / ")[0]} L{c.level}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
                {isBusiness && myRooms.length > 0 && (
                  <div className="px-5 pb-3 border-t border-border/30 pt-2 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); sendQuickInvite(r.user._id); }}
                      disabled={inviteLoadingId === r.user._id}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50 transition-colors"
                    >
                      {inviteLoadingId === r.user._id ? "Inviting..." : "+ Quick Invite"}
                    </button>
                    <span className="text-border/40 text-xs">·</span>
                    <button
                      onClick={() => navigate(`/talent/profile/${r.user._id}`)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View profile →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
