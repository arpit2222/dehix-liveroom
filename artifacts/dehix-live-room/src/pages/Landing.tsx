import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const STEPS = [
  { num: "01", title: "Describe your project", body: "Plain English. No technical brief needed. Our AI parses intent." },
  { num: "02", title: "AI scopes the work", body: "Roles, tickets, milestones, risks, and budget — generated in seconds." },
  { num: "03", title: "Match verified talent", body: "SBT credentials filter candidates by skill domain, level, and on-chain reputation." },
  { num: "04", title: "Live room opens", body: "Invite talent into a structured room. Built-in video, chat, and AI assistant." },
  { num: "05", title: "Squad signs NDA", body: "AI-generated contract, milestone-based escrow, all parties sign on-chain." },
  { num: "06", title: "Build in 60 minutes", body: "From raw idea to contracted, assembled Web3 team. Guaranteed." },
];

const STATS = [
  { value: "2,400+", label: "Teams assembled" },
  { value: "47 min", label: "Average assembly time" },
  { value: "12,000+", label: "Verified talent" },
  { value: "$48M+", label: "Milestone escrow locked" },
];

export default function Landing() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

  const handleCTA = (target: string) => {
    if (isAuthenticated) {
      navigate(target);
    } else {
      navigate("/register");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-xs">DX</span>
            </div>
            <span className="font-semibold tracking-tight text-foreground">DEHIX</span>
            <span className="text-muted-foreground/60 text-sm">Live Room</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate(user?.role === "business" ? "/business/dashboard" : "/talent/dashboard")}>
                  Dashboard
                </Button>
                <Button size="sm" onClick={() => navigate("/room/create")}>
                  Open Room
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Sign in</Button>
                <Button size="sm" onClick={() => navigate("/register")}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[80px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Real-time Web3 Hiring Infrastructure
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            From idea to
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary/80">
              squad in 60 minutes
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            DEHIX Live Room is where businesses go from a raw project description to a fully assembled, NDA-signed, escrow-backed Web3 team — in a single session.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button
              size="lg"
              className="px-8 h-12 text-base font-semibold glow-purple"
              onClick={() => handleCTA("/room/create")}
            >
              Open a Live Room
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="px-8 h-12 text-base"
              onClick={() => handleCTA("/talent/dashboard")}
            >
              Join as Talent
            </Button>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-12 border-y border-border/40 bg-card/30">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-foreground font-mono">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">How it works</h2>
            <p className="text-muted-foreground">Six steps, one session, one contract.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {STEPS.map((step) => (
              <div key={step.num} className="relative rounded-xl border border-border/50 bg-card p-6 hover:border-primary/40 transition-colors group">
                <div className="absolute top-4 right-4 font-mono text-xs text-primary/30 font-bold">{step.num}</div>
                <h3 className="font-semibold text-foreground mb-2 pr-8">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-24 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Ready to build something?
          </h2>
          <p className="text-muted-foreground mb-8">
            Your next Web3 team is 60 minutes away.
          </p>
          <Button size="lg" className="px-10 h-12 text-base font-semibold" onClick={() => navigate("/register")}>
            Get started — it's free
          </Button>
        </div>
      </section>
    </div>
  );
}
