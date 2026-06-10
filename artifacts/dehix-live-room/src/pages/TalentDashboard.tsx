import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetTalentInvites, useGetTalentCredentials, useRespondInvite, useUpdateAvailability, getGetTalentInvitesQueryKey, getGetTalentCredentialsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { SBTCredentialCard } from "@/components/SBTCredentialCard";
import { ReputationRing } from "@/components/ReputationRing";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  scoping: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  matching: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  open: "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20",
  assembling: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  contracted: "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20",
  closed: "text-muted-foreground bg-muted border-border",
};

export default function TalentDashboard() {
  const [, navigate] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { data: invites, refetch: refetchInvites } = useGetTalentInvites({ query: { enabled: isAuthenticated, queryKey: getGetTalentInvitesQueryKey() } });
  const { data: credentials } = useGetTalentCredentials(user?._id ?? "", { query: { enabled: !!user?._id, queryKey: getGetTalentCredentialsQueryKey(user?._id ?? "") } });
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [copiedRoomCode, setCopiedRoomCode] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileWallet, setProfileWallet] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("dehix_token");
    fetch("/api/talent/rooms", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setMyRooms(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [isAuthenticated]);

  const updateAvailability = useUpdateAvailability({
    mutation: {
      onSuccess: () => {
        const nextState = !(user?.isOnline ?? false);
        toast.success(nextState ? "You are now available for hire" : "You are now offline");
      },
      onError: () => toast.error("Failed to update availability"),
    },
  });

  const respondInvite = useRespondInvite({
    mutation: {
      onSuccess: (_, vars) => {
        refetchInvites();
        const action = (vars.data as any)?.action;
        if (action === "accept") toast.success("Joined room successfully!");
        else if (action === "decline") toast.info("Invitation declined");
      },
      onError: () => toast.error("Failed to respond to invitation"),
    },
  });

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

  const credList = Array.isArray(credentials) ? credentials : [];
  const inviteList = Array.isArray(invites) ? invites : [];
  const overallRep =
    credList.length > 0
      ? Math.round(credList.reduce((s: number, c: any) => s + (c.reputationScore ?? 0), 0) / credList.length)
      : 0;

  const isOnline = user?.isOnline ?? false;

  const toggleOnline = () => {
    updateAvailability.mutate({ data: { isOnline: !isOnline } });
  };

  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profileName || undefined, walletAddress: profileWallet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update profile");
      toast.success("Profile updated!");
      setEditingProfile(false);
      const stored = localStorage.getItem("dehix_user");
      if (stored) {
        const u = JSON.parse(stored);
        localStorage.setItem("dehix_user", JSON.stringify({ ...u, ...data }));
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-[10px]">DX</span>
            </div>
            <span className="font-medium text-sm">{user?.name}</span>
            <span className="text-xs text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">Talent</span>
            {inviteList.length > 0 && (
              <span className="text-[10px] font-bold bg-rose-600 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {inviteList.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isOnline ? "default" : "outline"}
              onClick={toggleOnline}
              className={isOnline ? "bg-green-700 hover:bg-green-600 border-green-600" : ""}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? "bg-green-300" : "bg-gray-500"}`} />
              {isOnline ? "Available" : "Offline"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/room/join")}>
              Join Room
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setProfileName(user?.name ?? ""); setProfileWallet((user as any)?.walletAddress ?? ""); setEditingProfile(true); }}>
              Edit Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/talent/profile/${user?._id}`)}>
              My Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Talent Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Your credentials, invitations, and availability</p>
          </div>
          <div className="flex items-center gap-3">
            <ReputationRing score={overallRep} size={64} />
            <div>
              <div className="text-xs text-muted-foreground">Overall Reputation</div>
              <div className="font-bold font-mono text-foreground text-xl">{overallRep}</div>
              <div className="text-xs text-muted-foreground">{credList.length} credential{credList.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>

        {/* Profile Edit Panel */}
        {editingProfile && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-8 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Edit Profile</span>
              <button onClick={() => setEditingProfile(false)} className="text-muted-foreground hover:text-foreground text-xs">✕ Cancel</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={user?.name ?? "Your name"}
                  className="w-full bg-card border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Wallet Address</label>
                <input
                  value={profileWallet}
                  onChange={(e) => setProfileWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-card border border-border/50 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <div className={`rounded-xl border p-4 text-center ${inviteList.length > 0 ? "border-rose-500/20 bg-rose-500/10" : "border-border/40 bg-card"}`}>
            <div className={`text-2xl font-bold font-mono ${inviteList.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{inviteList.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Pending invites</div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
            <div className="text-2xl font-bold font-mono">{myRooms.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Active rooms</div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
            <div className="text-2xl font-bold font-mono">{credList.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Credentials</div>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-center">
            <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
              ${myRooms.reduce((s: number, r: any) => s + (r.milestoneStats?.releasedUsd ?? 0), 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Escrow earned</div>
          </div>
          <div className={`rounded-xl border p-4 text-center cursor-pointer transition-colors ${isOnline ? "border-green-500/20 bg-green-500/10 hover:bg-green-500/10" : "border-border/40 bg-card hover:border-border/70"}`} onClick={toggleOnline}>
            <div className={`text-2xl font-bold font-mono ${isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
              {isOnline ? "On" : "Off"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Availability</div>
          </div>
        </div>

        {/* Join by code CTA */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Have a room code?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enter the code shared by a business to join their Live Room directly</p>
          </div>
          <Button size="sm" onClick={() => navigate("/room/join")}>
            Join by Code
          </Button>
        </div>

        {/* My Active Rooms */}
        {myRooms.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">My Active Rooms</h2>
              <span className="text-xs text-muted-foreground">{myRooms.length} room{myRooms.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {myRooms.map((entry: any) => (
                <div
                  key={entry.participantId}
                  className="rounded-xl border border-border/50 bg-card hover:border-primary/30 transition-colors"
                >
                  <button
                    onClick={() => navigate(`/room/${entry.room._id}`)}
                    className="w-full text-left p-4 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors truncate">{entry.room.title}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize shrink-0 ${STATUS_COLORS[entry.room.status] ?? ""}`}>
                        {entry.room.status}
                      </span>
                    </div>
                    {entry.role && (
                      <p className="text-xs text-primary font-medium mb-1">{entry.role.roleTitle}</p>
                    )}
                    {entry.room.meetLink && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        <p className="text-[11px] text-green-600 dark:text-green-400">Meet link available</p>
                      </div>
                    )}
                    {entry.room.contractedAt && (
                      <p className="text-[11px] text-blue-600/80 dark:text-blue-400/70 mt-0.5">Contracted {new Date(entry.room.contractedAt).toLocaleDateString()}</p>
                    )}
                    {entry.milestoneStats?.total > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Escrow</span>
                          <span className="text-[10px] font-mono text-green-600 dark:text-green-400">${(entry.milestoneStats.releasedUsd ?? 0).toLocaleString()} / ${(entry.milestoneStats.totalUsd ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${entry.milestoneStats.totalUsd > 0 ? Math.round((entry.milestoneStats.releasedUsd / entry.milestoneStats.totalUsd) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                  <div className="px-4 pb-3 border-t border-border/30 pt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground font-mono">{entry.room.roomCode}</span>
                    <span className="text-border/40 text-xs">·</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(entry.room.roomCode).then(() => {
                          setCopiedRoomCode(entry.room.roomCode);
                          setTimeout(() => setCopiedRoomCode(null), 2000);
                        });
                      }}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      {copiedRoomCode === entry.room.roomCode ? "✓ Copied!" : "Copy code"}
                    </button>
                    {entry.milestoneStats?.total > 0 && (
                      <>
                        <span className="text-border/40 text-xs">·</span>
                        <span className="text-[11px] text-muted-foreground">{entry.milestoneStats.total} milestone{entry.milestoneStats.total !== 1 ? "s" : ""}</span>
                      </>
                    )}
                    <span className="text-border/40 text-xs">·</span>
                    <button
                      onClick={() => navigate(`/room/${entry.room._id}`)}
                      className="text-[11px] text-primary hover:underline transition-colors"
                    >
                      Enter room →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Invitations</h2>
              {inviteList.length > 0 && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                  {inviteList.length}
                </span>
              )}
            </div>
            {inviteList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">No pending invitations</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Set yourself as available to receive invites</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inviteList.map((invite: any) => (
                  <div key={invite._id} className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-sm leading-tight">{invite.room?.title ?? "Unknown project"}</h3>
                      {invite.role && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-primary font-medium">{invite.role.roleTitle}</span>
                          <span className="text-xs text-muted-foreground">{invite.role.skillDomain}</span>
                        </div>
                      )}
                        {invite.role?.minReputation > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Min reputation: <span className="font-mono text-foreground/70">{invite.role.minReputation}</span>
                        </div>
                      )}
                      {invite.room?.roomCode && (
                        <div className="text-xs text-muted-foreground/60 font-mono mt-1">{invite.room.roomCode}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          respondInvite.mutate({ data: { participantId: invite._id, action: "accept" } });
                          if (invite.roomId) navigate(`/room/${invite.roomId}`);
                        }}
                      >
                        Join Room
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondInvite.mutate({ data: { participantId: invite._id, action: "decline" } })}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-semibold mb-4">SBT Credentials</h2>
            {credList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">No credentials issued yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Credentials are verified and issued after GitHub analysis and technical interviews
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {credList.map((cred: any) => (
                  <SBTCredentialCard key={cred._id} credential={cred} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
