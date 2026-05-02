import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { mutate, isPending } = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token, data.user);
        navigate(data.user.role === "business" ? "/business/dashboard" : "/talent/dashboard");
      },
      onError: (err: any) => {
        setError(err?.data?.error ?? err?.message ?? "Login failed");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-xs">DX</span>
            </div>
            <span className="font-semibold tracking-tight">DEHIX Live Room</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <button onClick={() => navigate("/register")} className="text-primary hover:underline font-medium">
            Create one
          </button>
        </div>

        <div className="mt-8 rounded-lg border border-border/50 bg-card/50 p-4">
          <p className="text-xs text-muted-foreground font-medium mb-2">Demo accounts</p>
          <div className="space-y-1 text-xs font-mono text-muted-foreground">
            <div>business@demo.com / demo123 (Business)</div>
            <div>alex@demo.com / demo123 (Talent)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
