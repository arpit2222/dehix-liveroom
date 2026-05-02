import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_ACCOUNTS = [
  { label: "Business", email: "business@demo.com", password: "demo123", desc: "Nexus Protocol — open rooms, scope projects, hire talent" },
  { label: "Developer", email: "alex@demo.com", password: "demo123", desc: "Alex Chen — Solidity L2 · Reputation 920" },
];

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

  const { mutate, isPending } = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token, data.user);
        navigate(data.user.role === "business" ? "/business/dashboard" : "/talent/dashboard");
      },
      onError: (err: any) => {
        setError(err?.data?.error ?? err?.message ?? "Login failed");
        setLoadingDemo(null);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    mutate({ data: { email, password } });
  };

  const quickLogin = (demoEmail: string, demoPassword: string, label: string) => {
    setError("");
    setLoadingDemo(label);
    mutate({ data: { email: demoEmail, password: demoPassword } });
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

        {/* QUICK DEMO ACCESS */}
        <div className="mb-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Quick Demo Access</span>
          </div>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                onClick={() => quickLogin(acc.email, acc.password, acc.label)}
                disabled={isPending}
                className="w-full text-left rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors group disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {loadingDemo === acc.label ? "Signing in..." : `Enter as ${acc.label}`}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{acc.desc}</div>
                  </div>
                  <div className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors ml-2">→</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/40" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs text-muted-foreground/60">or sign in manually</span>
          </div>
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
            {isPending && !loadingDemo ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <button onClick={() => navigate("/register")} className="text-primary hover:underline font-medium">
            Create one
          </button>
        </div>
      </div>
    </div>
  );
}
