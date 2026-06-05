import { useState } from "react";
import { useLocation } from "wouter";
import { useGetMyRooms, getGetMyRoomsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
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

export default function BusinessDashboard() {
  const [, navigate] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data: rooms, isLoading } = useGetMyRooms({ query: { enabled: isAuthenticated, queryKey: getGetMyRoomsQueryKey() } });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<"all" | "active" | "contracted" | "closed">("all");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileWallet, setProfileWallet] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

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

  const roomList = Array.isArray(rooms) ? rooms : [];
  const activeRooms = roomList.filter((r: any) => !["closed"].includes(r.status));
  const pastRooms = roomList.filter((r: any) => r.status === "closed");

  const copyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(
      () => toast.success(`Room code ${code} copied!`),
      () => toast.error("Failed to copy code")
    );
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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
            <span className="text-xs text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">Business</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/talent/discovery")}>
              Find Talent
            </Button>
            <Button size="sm" onClick={() => navigate("/room/create")}>
              New Live Room
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setProfileName(user?.name ?? ""); setProfileWallet((user as any)?.walletAddress ?? ""); setEditingProfile(true); }}>
              Edit Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Business Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your live rooms and assembled squads</p>
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

        {/* Stats row */}
        {!isLoading && roomList.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            {[
              { label: "Total Rooms", value: roomList.length, mono: false },
              { label: "Participants", value: roomList.reduce((s: number, r: any) => s + (r.participantCount ?? 0), 0), mono: false },
              { label: "Contracted", value: roomList.filter((r: any) => r.status === "contracted").length, mono: false },
              { label: "Closed", value: pastRooms.length, mono: false },
              {
                label: "Total Escrow",
                value: `$${roomList.reduce((s: number, r: any) => s + (r.milestoneStats?.totalUsd ?? 0), 0).toLocaleString()}`,
                sub: `$${roomList.reduce((s: number, r: any) => s + (r.milestoneStats?.releasedUsd ?? 0), 0).toLocaleString()} released`,
                mono: true,
              },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/40 bg-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.mono ? "font-mono text-green-600 dark:text-green-400" : "text-foreground"}`}>{s.value}</div>
                {(s as any).sub && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{(s as any).sub}</div>}
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {(["all", "active", "contracted", "closed"] as const).map((f) => {
                const count = f === "all" ? roomList.length : f === "active" ? activeRooms.length : f === "closed" ? pastRooms.length : roomList.filter((r: any) => r.status === "contracted").length;
                return (
                  <button
                    key={f}
                    onClick={() => setRoomFilter(f)}
                    className={`text-xs px-3 py-1 rounded-md capitalize transition-colors ${roomFilter === f ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                  >
                    {f} <span className="ml-1 text-[10px] opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Search rooms..."
                className="bg-card border border-border/50 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary/50 w-40 placeholder:text-muted-foreground/40"
              />
            </div>
          </div>
          {isLoading ? (
            <div className="grid gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-card/50 border border-border/40 animate-pulse" />
              ))}
            </div>
          ) : roomList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
              <p className="text-muted-foreground text-sm mb-4">No active rooms</p>
              <Button size="sm" onClick={() => navigate("/room/create")}>
                Open your first room
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {roomList.filter((r: any) => {
                if (roomFilter === "active") return !["closed", "contracted"].includes(r.status);
                if (roomFilter === "contracted") return r.status === "contracted";
                if (roomFilter === "closed") return r.status === "closed";
                return true;
              }).filter((r: any) => !roomSearch || r.title.toLowerCase().includes(roomSearch.toLowerCase())).map((room: any) => (
                <div
                  key={room._id}
                  className="rounded-xl border border-border/50 bg-card hover:border-primary/40 transition-colors group"
                >
                  <button
                    onClick={() => navigate(`/room/${room._id}`)}
                    className="w-full text-left p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${STATUS_COLORS[room.status] ?? ""}`}>
                            {room.status}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">{room.roomCode}</span>
                        </div>
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{room.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{room.rawDescription}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <div className="text-xs text-muted-foreground">{new Date(room.createdAt).toLocaleDateString()}</div>
                        {room.contractedAt && (
                          <div className="text-[11px] text-blue-600/80 dark:text-blue-400/70">Contracted {new Date(room.contractedAt).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="px-5 pb-3 flex items-center gap-2 border-t border-border/30">
                    <button
                      onClick={(e) => copyCode(e, room.roomCode)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                    >
                      {copiedCode === room.roomCode ? (
                        <span className="text-green-600 dark:text-green-400">✓ Copied!</span>
                      ) : (
                        <>
                          <span>📋</span> Copy invite code
                        </>
                      )}
                    </button>
                    {room.participantCount > 0 && (
                      <>
                        <span className="text-border/40 text-xs">·</span>
                        <span className="text-[11px] text-muted-foreground font-mono">{room.participantCount} joined</span>
                      </>
                    )}
                    {room.ticketStats?.total > 0 && (
                      <>
                        <span className="text-border/40 text-xs">·</span>
                        <span className="text-[11px] text-muted-foreground">{room.ticketStats.done}/{room.ticketStats.total} tickets</span>
                      </>
                    )}
                    {room.milestoneStats?.total > 0 && (
                      <>
                        <span className="text-border/40 text-xs">·</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.round((room.milestoneStats.releasedUsd / (room.milestoneStats.totalUsd || 1)) * 100))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            ${room.milestoneStats.releasedUsd?.toLocaleString() ?? 0}/${room.milestoneStats.totalUsd?.toLocaleString() ?? 0}
                          </span>
                        </div>
                      </>
                    )}
                    <span className="text-border/40 text-xs">·</span>
                    <button
                      onClick={() => navigate(`/talent/discovery`)}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Find talent →
                    </button>
                    {room.status === "assembling" && (
                      <>
                        <span className="text-border/40 text-xs">·</span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Mark this room as contracted? This indicates all parties have agreed.")) return;
                            try {
                              const token = localStorage.getItem("dehix_token");
                              const res = await fetch(`/api/rooms/${room._id}/contract`, {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              if (!res.ok) throw new Error("Failed");
                              await queryClient.invalidateQueries({ queryKey: getGetMyRoomsQueryKey() });
                              toast.success("Room contracted!");
                            } catch {
                              toast.error("Failed to contract room");
                            }
                          }}
                          className="text-[11px] text-blue-600/80 dark:text-blue-400/80 hover:text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/10 rounded px-1.5 py-0.5 transition-colors"
                        >
                          ✓ Contract
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
