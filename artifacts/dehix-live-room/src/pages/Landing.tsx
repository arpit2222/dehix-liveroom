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

const FEATURES = [
  {
    icon: "🤖",
    title: "GPT-Powered AI Research",
    body: "An always-on AI assistant inside every room. Ask about competitors, market sizing, architecture tradeoffs, salary benchmarks — anything. It knows your project context.",
  },
  {
    icon: "🔗",
    title: "On-Chain SBT Credentials",
    body: "Every developer has a Soul Bound Token proving their skills, level, GitHub activity, and past projects. No more fake resumes — reputation is verifiable on-chain.",
  },
  {
    icon: "📋",
    title: "Auto-Generated Documents",
    body: "Turn your chat conversation into a pitch deck, technical spec, statement of work, or project brief in one click. AI formats everything professionally.",
  },
  {
    icon: "💰",
    title: "Milestone-Based Escrow",
    body: "Define milestones with dollar amounts. Business approves each milestone to release payment. Fully transparent, dispute-resistant, on-chain.",
  },
  {
    icon: "📝",
    title: "AI-Generated NDA",
    body: "Smart contract-style NDA generated and signed in the room. Covers confidentiality, IP ownership, milestone payments, and jurisdiction in minutes.",
  },
  {
    icon: "⚡",
    title: "Real-Time Collaboration",
    body: "Firebase-backed live chat, Socket.io events, kanban tickets, milestone tracking — everything updates instantly across all participants.",
  },
  {
    icon: "📌",
    title: "Room Notes & Export",
    body: "Add private notes visible to all room members. Export the entire room — brief, roles, participants, milestones, tickets, and NDA status — as a formatted Markdown file in one click.",
  },
  {
    icon: "🔴",
    title: "Remove & Manage Talent",
    body: "Businesses can remove participants from rooms, contract assembled squads with a single click, and track the full room lifecycle from scoping to closed.",
  },
  {
    icon: "📊",
    title: "Room Activity Feed",
    body: "Every room maintains a real-time audit trail — participant joins, NDA signings, milestone releases, contract events, and AI brief generation are all logged and timestamped.",
  },
  {
    icon: "💎",
    title: "Talent Escrow Dashboard",
    body: "Developers see exactly how much they've earned across all rooms. Per-room escrow bars show released vs. total milestone amounts at a glance.",
  },
];

const TESTIMONIALS = [
  {
    quote: "We went from a rough Notion doc to a 4-person signed team in under an hour. The AI brief alone saved us a week of back-and-forth.",
    name: "Lena K.",
    role: "DeFi Protocol Founder",
  },
  {
    quote: "As a smart contract dev, having my SBT credential speak for me means I skip the interviews and go straight to interesting projects.",
    name: "David M.",
    role: "Solidity Engineer, L2 rep 920",
  },
  {
    quote: "The document mode is incredible. We used the chat to research, then generated a full technical deck for our investors in one click.",
    name: "Priya S.",
    role: "CTO, Web3 Infrastructure Startup",
  },
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
                {user?.role === "business" ? (
                  <Button size="sm" onClick={() => navigate("/room/create")}>
                    Open Room
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => navigate("/room/join")}>
                    Join Room
                  </Button>
                )}
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

      {/* FEATURES */}
      <section className="py-24 px-6 bg-card/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need in one room</h2>
            <p className="text-muted-foreground">AI-powered, Web3-native, real-time collaboration from brief to contract.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border/50 bg-card p-6 hover:border-primary/30 transition-colors">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
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

      {/* TESTIMONIALS */}
      <section className="py-24 px-6 border-t border-border/40 bg-card/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Trusted by Web3 builders</h2>
            <p className="text-muted-foreground">From solo founders to protocol teams.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-xl border border-border/50 bg-card p-6">
                <p className="text-sm text-muted-foreground leading-relaxed italic mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">{t.name[0]}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO CTA */}
      <section className="py-16 px-6 border-y border-border/40">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Try the demo room now</h2>
            <p className="text-sm text-muted-foreground mb-4">Room code <span className="font-mono text-foreground bg-card border border-border/50 rounded px-1.5 py-0.5">NEXUS001</span> · No sign-up needed for read access</p>
            
            <div className="bg-card/50 border border-border/50 rounded-lg p-4 max-w-sm">
              <h3 className="text-sm font-semibold mb-2">Demo Accounts (Password: demo123)</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong className="text-foreground">Business:</strong> business@demo.com</li>
                <li><strong className="text-foreground">Talent (Solidity):</strong> alex@demo.com</li>
                <li><strong className="text-foreground">Talent (React):</strong> priya@demo.com</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={() => navigate("/login")}>
              Sign in to explore
            </Button>
            <Button onClick={() => navigate("/register")} className="glow-purple">
              Create free account
            </Button>
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
