import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetTalentProfile, useGetTalentCredentials, useGetMyRooms, getGetTalentProfileQueryKey, getGetTalentCredentialsQueryKey, getGetMyRoomsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { SBTCredentialCard } from "@/components/SBTCredentialCard";
import { ReputationRing } from "@/components/ReputationRing";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TalentProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { data: profileData, isLoading: loadingProfile } = useGetTalentProfile(id ?? "", { query: { enabled: !!id, queryKey: getGetTalentProfileQueryKey(id ?? "") } });
  const { data: credentials } = useGetTalentCredentials(id ?? "", { query: { enabled: !!id, queryKey: getGetTalentCredentialsQueryKey(id ?? "") } });
  const { data: myRooms } = useGetMyRooms({ query: { enabled: isAuthenticated && currentUser?.role === "business", queryKey: getGetMyRoomsQueryKey() } });

  const [inviting, setInviting] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");

  const profile = (profileData as any);
  const user = profile?.user;
  const credList = Array.isArray(credentials) ? credentials : [];
  const overallRep = profile?.overallReputation ?? 0;
  const roomList = Array.isArray(myRooms) ? (myRooms as any[]).filter((r) => r.status !== "closed") : [];

  const isBusiness = currentUser?.role === "business";

  const sendInvite = async () => {
    if (!selectedRoomId || !id) return;
    setInviteStatus("loading");
    setInviteError("");
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${selectedRoomId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to invite");
      setInviteStatus("success");
      toast.success(data.message ?? `${user?.name ?? "Talent"} has been invited to the room!`);
      setTimeout(() => { setInviting(false); setInviteStatus("idle"); }, 2000);
    } catch (e: any) {
      const msg = e.message ?? "Failed to invite talent";
      setInviteError(msg);
      setInviteStatus("error");
      toast.error(msg);
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Profile not found</p>
          <Button onClick={() => navigate(-1 as any)}>Go back</Button>
        </div>
      </div>
    );
  }

  const truncateWallet = (w: string) => w ? `${w.slice(0, 6)}...${w.slice(-4)}` : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1 as any)} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Back
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">Talent Profile</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-start gap-6 mb-10 pb-10 border-b border-border/40">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-xl">{user.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
                {user.walletAddress && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-muted-foreground bg-card border border-border/50 rounded px-2 py-0.5">
                      {truncateWallet(user.walletAddress)}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(user.walletAddress).then(
                          () => toast.success("Wallet address copied!"),
                          () => toast.error("Failed to copy")
                        );
                      }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded border border-border/30 hover:border-primary/30"
                      title="Copy wallet address"
                    >
                      Copy
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isOnline ? "bg-green-400" : "bg-gray-600"}`} />
                    {user.isOnline ? "Available for hire" : "Not available"}
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground">{credList.length} credential{credList.length !== 1 ? "s" : ""}</span>
                </div>
                {credList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {credList.slice(0, 5).map((c: any) => (
                      <span key={c._id} className="text-[11px] border border-primary/30 bg-primary/5 text-primary rounded-full px-2.5 py-0.5 font-medium">
                        {c.skillDomain.split(" / ")[0]} L{c.level}
                      </span>
                    ))}
                    {credList.length > 5 && (
                      <span className="text-[11px] text-muted-foreground border border-border/40 rounded-full px-2.5 py-0.5">
                        +{credList.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <ReputationRing score={overallRep} size={72} strokeWidth={6} />
                <span className="text-xs text-muted-foreground">Overall rep</span>
              </div>
            </div>

            {isBusiness && (
              <div className="mt-4">
                {!inviting ? (
                  <Button
                    size="sm"
                    onClick={() => { setInviting(true); setSelectedRoomId(roomList[0]?._id ?? ""); }}
                    disabled={roomList.length === 0}
                  >
                    {roomList.length === 0 ? "No active rooms to invite to" : "Invite to Live Room"}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 bg-card border border-border/50 rounded-xl p-4">
                    <p className="text-xs font-medium text-muted-foreground">Select a room to invite {user.name}</p>
                    <select
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:border-primary/50"
                    >
                      {roomList.map((r: any) => (
                        <option key={r._id} value={r._id}>{r.title}</option>
                      ))}
                    </select>
                    {inviteError && (
                      <p className="text-xs text-destructive">{inviteError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={sendInvite}
                        disabled={inviteStatus === "loading" || !selectedRoomId}
                        className="flex-1"
                      >
                        {inviteStatus === "loading" ? "Inviting..." :
                         inviteStatus === "success" ? "✓ Invited!" : "Send Invite"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setInviting(false); setInviteStatus("idle"); setInviteError(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {credList.length > 0 && (
          <div className="rounded-xl border border-border/40 bg-card p-4 mb-8 flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{overallRep}</div>
              <div className="text-xs text-muted-foreground">Avg reputation</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{credList.length}</div>
              <div className="text-xs text-muted-foreground">Credentials</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">
                {Math.max(...credList.map((c: any) => c.reputationScore ?? 0))}
              </div>
              <div className="text-xs text-muted-foreground">Peak score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">
                {credList.reduce((s: number, c: any) => s + (c.projectsCompleted ?? 0), 0)}
              </div>
              <div className="text-xs text-muted-foreground">Projects done</div>
            </div>
            {credList.some((c: any) => c.githubScore > 0) && (
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {Math.max(...credList.map((c: any) => c.githubScore ?? 0))}
                </div>
                <div className="text-xs text-muted-foreground">GitHub score</div>
              </div>
            )}
            {credList.some((c: any) => c.interviewScore > 0) && (
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {Math.max(...credList.map((c: any) => c.interviewScore ?? 0))}
                </div>
                <div className="text-xs text-muted-foreground">Interview score</div>
              </div>
            )}
          </div>
        )}

        <section>
          <h2 className="font-semibold mb-4">SBT Credentials ({credList.length})</h2>
          {credList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">No credentials issued yet</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {credList.map((cred: any) => (
                <SBTCredentialCard key={cred._id} credential={cred} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
