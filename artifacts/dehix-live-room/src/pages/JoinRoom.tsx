import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function JoinRoom() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in to join a room</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  const handleJoin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join room");
      navigate(`/room/${data.room._id}`);
    } catch (e: any) {
      const msg = e.message ?? "Failed to join room";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(user?.role === "business" ? "/business/dashboard" : "/talent/dashboard")}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← Dashboard
          </button>
          <span className="text-border/40">/</span>
          <span className="font-semibold text-sm">Join a Room</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Join a Live Room</h1>
            <p className="text-sm text-muted-foreground">
              Enter the room code shared by the business to join their project
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Room Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="e.g. NEXUS001"
                maxLength={12}
                className="w-full bg-card border border-border/50 rounded-xl px-4 py-3.5 text-lg font-mono tracking-widest text-center outline-none focus:border-primary/50 placeholder:text-muted-foreground/30 placeholder:font-sans placeholder:tracking-normal placeholder:text-base"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleJoin}
              disabled={loading || !code.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Joining room...
                </span>
              ) : "Join Room"}
            </Button>

            <p className="text-center text-xs text-muted-foreground/60">
              Don't have a code?{" "}
              <button onClick={() => navigate("/talent/discovery")} className="text-primary hover:underline">
                Browse open positions
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
