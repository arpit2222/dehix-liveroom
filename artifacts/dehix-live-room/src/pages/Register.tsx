import { useState } from "react";
import { useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "talent" as "talent" | "business",
    walletAddress: "",
  });
  const [error, setError] = useState("");

  const { mutate, isPending } = useRegister({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token, data.user);
        navigate(data.user.role === "business" ? "/business/dashboard" : "/talent/dashboard");
      },
      onError: (err: any) => {
        setError(err?.data?.error ?? err?.message ?? "Registration failed");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    mutate({
      data: {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.walletAddress ? { walletAddress: form.walletAddress } : {}),
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-xs">DX</span>
            </div>
            <span className="font-semibold tracking-tight">DEHIX Live Room</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Create your account</h1>
          <p className="text-sm text-muted-foreground">Join the Web3 hiring network</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Alex Chen"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label>I am a</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["talent", "business"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`py-2.5 px-4 rounded-md border text-sm font-medium transition-colors capitalize ${
                    form.role === r
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {r === "talent" ? "Developer" : "Business"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wallet">
              Wallet address <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="wallet"
              value={form.walletAddress}
              onChange={(e) => setForm((f) => ({ ...f, walletAddress: e.target.value }))}
              placeholder="0x..."
              className="font-mono text-sm"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button onClick={() => navigate("/login")} className="text-primary hover:underline font-medium">
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
