import { useLocation } from "wouter";
import { useGetMyRooms, getGetMyRoomsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const STATUS_COLORS: Record<string, string> = {
  scoping: "text-blue-400 bg-blue-950/40 border-blue-800/40",
  matching: "text-amber-400 bg-amber-950/40 border-amber-800/40",
  open: "text-emerald-400 bg-emerald-950/40 border-emerald-800/40",
  assembling: "text-violet-400 bg-violet-950/40 border-violet-800/40",
  contracted: "text-cyan-400 bg-cyan-950/40 border-cyan-800/40",
  closed: "text-gray-400 bg-gray-950/40 border-gray-700/40",
};

export default function BusinessDashboard() {
  const [, navigate] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { data: rooms, isLoading } = useGetMyRooms({ query: { enabled: isAuthenticated, queryKey: getGetMyRoomsQueryKey() } });

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
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => navigate("/room/create")}>
              New Live Room
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

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Active Rooms</h2>
            <span className="text-xs text-muted-foreground">{activeRooms.length} room{activeRooms.length !== 1 ? "s" : ""}</span>
          </div>
          {isLoading ? (
            <div className="grid gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-card/50 border border-border/40 animate-pulse" />
              ))}
            </div>
          ) : activeRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
              <p className="text-muted-foreground text-sm mb-4">No active rooms</p>
              <Button size="sm" onClick={() => navigate("/room/create")}>
                Open your first room
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {activeRooms.map((room: any) => (
                <button
                  key={room._id}
                  onClick={() => navigate(`/room/${room._id}`)}
                  className="w-full text-left rounded-xl border border-border/50 bg-card p-5 hover:border-primary/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${STATUS_COLORS[room.status] ?? ""}`}>
                          {room.status}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{room.roomCode}</span>
                      </div>
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{room.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{room.rawDescription}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(room.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {pastRooms.length > 0 && (
          <section>
            <h2 className="font-semibold mb-4">Past Rooms</h2>
            <div className="grid gap-3">
              {pastRooms.map((room: any) => (
                <button
                  key={room._id}
                  onClick={() => navigate(`/room/${room._id}`)}
                  className="w-full text-left rounded-xl border border-border/30 bg-card/50 p-5 hover:border-border/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-foreground/70">{room.title}</h3>
                      <span className="text-xs font-mono text-muted-foreground">{room.roomCode}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(room.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
