export function mockScope(description: string) {
  const words = description.split(" ");
  const titleWords = words.slice(0, 6).join(" ");
  return {
    projectTitle: titleWords.length > 10 ? titleWords.slice(0, 40) : "Web3 Platform Build",
    projectSummary:
      "An AI-assisted analysis of your project requirements. This mock brief is generated in demo mode — connect an AI key for a real AI-powered breakdown tailored to your description.",
    estimatedWeeks: 10,
    complexity: "high",
    roles: [
      {
        roleTitle: "Lead Smart Contract Engineer",
        skillDomain: "Solidity / Smart Contracts",
        requiredLevel: 2,
        minReputation: 800,
        responsibilities: ["Write and audit core contracts", "Design token economics", "Deploy to testnet"],
        estimatedHours: 280,
      },
      {
        roleTitle: "Full-Stack React Developer",
        skillDomain: "React / Frontend",
        requiredLevel: 1,
        minReputation: 600,
        responsibilities: ["Build dashboard UI", "Integrate wallet connect", "Charts and analytics"],
        estimatedHours: 200,
      },
      {
        roleTitle: "Backend API Engineer",
        skillDomain: "Node.js / Backend",
        requiredLevel: 1,
        minReputation: 500,
        responsibilities: ["REST + websocket API", "Indexer integration", "Auth and sessions"],
        estimatedHours: 160,
      },
    ],
    milestones: [
      { title: "Architecture & Design", description: "Tech stack, contracts spec, wireframes approved", durationWeeks: 2, percentageOfBudget: 15 },
      { title: "Core Contracts & API", description: "Smart contracts deployed to testnet, API skeleton live", durationWeeks: 4, percentageOfBudget: 35 },
      { title: "Frontend Integration", description: "Full dashboard wired to contracts and API, staging deploy", durationWeeks: 3, percentageOfBudget: 35 },
      { title: "Audit & Mainnet Launch", description: "Security audit complete, mainnet deployment", durationWeeks: 1, percentageOfBudget: 15 },
    ],
    tickets: [
      { title: "Set up monorepo and CI/CD", description: "Hardhat + Next.js + GitHub Actions", milestoneNumber: 1, roleTitle: "Backend API Engineer", estimatedHours: 8 },
      { title: "Write ERC-20 token contract", description: "With mint/burn and access control", milestoneNumber: 2, roleTitle: "Lead Smart Contract Engineer", estimatedHours: 24 },
      { title: "Implement wallet connect modal", description: "RainbowKit or ConnectKit integration", milestoneNumber: 3, roleTitle: "Full-Stack React Developer", estimatedHours: 12 },
    ],
    technicalRisks: [
      "Smart contract vulnerabilities — require formal audit before mainnet",
      "Gas cost spikes on L1 — consider L2 deployment as primary",
      "Wallet UX friction — may need account abstraction layer",
    ],
    suggestedTotalBudgetUsd: 68000,
  };
}

export function mockChat(message: string, projectTitle: string): string {
  const m = message.toLowerCase();

  if (m.includes("viab") || m.includes("viable") || m.includes("feasib") || m.includes("is it worth") || m.includes("should i build") || m.includes("make sense")) {
    return `Viability analysis for "${projectTitle}":

MARKET SIGNAL: Strong. The core problem — fragmented, unverifiable Web3 talent and project coordination — is real and consistently reported across protocols and DAOs. Electric Capital's 2024 dev report shows 23,000+ monthly active crypto developers; the supply exists but the trust layer doesn't.

TIMING: Favorable. Post-FTX, institutional players are demanding auditable, credential-verified partners. L2 gas costs are now low enough to make on-chain credentials economically viable ($0.05–$0.15 per issuance on Polygon/Arbitrum).

MONETIZATION PATH: Clear. A 2–3% platform fee on milestone escrow is standard (Braintrust charges 10%), and subscription tiers for power users are proven in the B2B SaaS playbook.

MAIN RISKS:
1. Cold-start problem — you need both businesses and verified talent before the platform is useful. Solve supply-side first: seed 50–100 high-quality talent profiles before launch.
2. Trust and safety — fake credentials will be attempted. SBT + GitHub + interview-based verification is the right multi-layer approach.
3. Regulatory grey area — positioning as a coordination platform (not employer) is correct, but KYC requirements for escrow above certain thresholds may apply.

VERDICT: Viable with strong market timing. The technical execution risk is low (the stack is proven); the distribution risk is the real challenge.`;
  }

  if (m.includes("market") || m.includes("tam") || m.includes("sam") || m.includes("opportunity") || m.includes("size")) {
    return `Market sizing for "${projectTitle}":

TAM — Total Addressable Market:
• Global blockchain professional services: $67B by 2026 (Gartner)
• Global freelance tech market: $1.5T by 2027 (Statista)

SAM — Serviceable Addressable Market:
• Web3-native talent and project management: ~$4.2B
• Defined as: projects actively seeking verifiable Web3 devs with escrow/milestone structures

SOM — Serviceable Obtainable Market (Year 3):
• Realistic 0.5% capture = ~$21M ARR
• At 2.5% platform fee, this implies $840M in milestone volume — achievable with 5,000–8,000 active projects/year

COMPARABLE: Braintrust (decentralized talent) hit $100M GMV in year 3. Toptal hit $200M ARR by year 5. Your differentiation (on-chain credentials + real-time collab + AI scoping) is genuinely additive, not just a rebrand.`;
  }

  if (m.includes("competi") || m.includes("vs ") || m.includes("alternative") || m.includes("differ")) {
    return `Competitive landscape for "${projectTitle}":

DIRECT COMPETITORS:
• Upwork — massive scale, zero Web3 native features, high fees (20%), no credential verification, no escrow
• Toptal — curated but expensive ($200/hr floor), no blockchain-native tooling, slow (weeks to match)
• Braintrust — Web3-friendly, token economy, but no real-time collaboration or AI features
• Gitcoin — grant-focused, not project execution, no NDA/contract layer

YOUR MOATS:
1. AI-powered scoping → room brief in 60 seconds vs. 2-week back-and-forth
2. SBT credentials → portable, non-transferable reputation that follows the developer
3. Real-time Live Room → negotiation + collaboration + signing in one session
4. On-chain NDA + milestone escrow → zero payment disputes

POSITIONING: You're not competing with Upwork on volume. You're competing on trust density — the premium tier for Web3-native project execution where credential verification and dispute-free payment actually matter.`;
  }

  if (m.includes("token") || m.includes("tokenomic") || m.includes("sbt") || m.includes("credential") || m.includes("soul")) {
    return `Tokenomics and credential design for "${projectTitle}":

SBT (Soul-Bound Token) CREDENTIALS:
• Non-transferable ERC-721 variant — cannot be sold or delegated
• Issued per skill domain (Solidity L2, React, Node.js, etc.)
• Metadata: skill level (L1/L2), reputation score, projects completed, last active
• Storage: IPFS for metadata, on-chain for ownership + verification

REPUTATION SCORING MODEL:
• GitHub analysis: code quality, contribution frequency, open-source track record → 0–400 pts
• Platform interview: structured technical interview scored by domain experts → 0–400 pts
• Project history: client ratings, on-time delivery, dispute rate → 0–200 pts
• Total: 0–1000 scale; 700+ = highly trusted; 500–699 = trusted; below 500 = unverified

CHAIN RECOMMENDATION:
• Polygon or Arbitrum for credential issuance — $0.05–$0.15 per mint, EVM-compatible
• Avoid Ethereum mainnet for credentials (gas too unpredictable)

ECONOMIC DESIGN:
• No native platform token needed at launch — adds regulatory complexity without product benefit
• Token can be introduced post-product-market-fit for governance and staking mechanisms`;
  }

  if (m.includes("budget") || m.includes("cost") || m.includes("price") || m.includes("rate") || m.includes("salary") || m.includes("pay")) {
    return `Budget and market rates for "${projectTitle}":

TALENT MARKET RATES (2024/2025, verified Web3 devs):
• Senior Solidity Engineer: $180–$250/hr ($140k–$200k/yr equivalent)
• Smart Contract Auditor: $200–$350/hr (often project-based: $20k–$80k per audit)
• Full-Stack React Dev (Web3 experience): $120–$160/hr
• Backend/API Engineer (Node.js/Rust): $100–$140/hr
• DevOps/Infrastructure: $90–$130/hr

TYPICAL PROJECT BUDGETS:
• MVP / Proof of Concept: $40k–$80k (8–10 weeks, 2–3 devs)
• Full Product Launch: $100k–$250k (12–16 weeks, 4–6 devs)
• Protocol-scale build: $500k+ (6+ months, 8+ devs + audit)

MILESTONE SPLIT (best practice):
• 15% upfront (architecture + spec)
• 35% mid-build (core contracts + API)
• 35% feature complete (frontend + integration)
• 15% at launch (audit + deployment)

AUDIT COSTS: $15k–$50k for reputable firms (Trail of Bits, Consensys Diligence, OpenZeppelin). Non-negotiable for mainnet.`;
  }

  if (m.includes("timeline") || m.includes("how long") || m.includes("weeks") || m.includes("sprint") || m.includes("deadline")) {
    return `Timeline breakdown for "${projectTitle}":

REALISTIC SCHEDULE (full product):
Week 1–2:   Architecture, tech spec, wireframes, contract interfaces defined
Week 3–6:   Core build — smart contracts on testnet, API skeleton, auth
Week 7–9:   Frontend integration — UI wired to contracts and API
Week 10:    Internal QA, bug fixes, staging deployment
Week 11–12: External audit (if applicable), performance testing
Week 12–14: Mainnet deployment, monitoring, go-live

TOTAL: 12–14 weeks with a team of 3–4 devs

COMMON TIMELINE KILLERS:
1. Scope creep in weeks 3–6 (freeze scope after week 2)
2. Audit findings requiring contract rewrites (2–4 week delay)
3. Wallet/chain integration edge cases taking 2x longer than estimated
4. Slow client feedback loops (set a 48-hour SLA for approvals)

ACCELERATION OPTIONS:
• Pre-built components (OpenZeppelin, Wagmi, RainbowKit) save 3–4 weeks
• A pre-audited contract template can save 2–3 weeks on the audit phase
• Daily async standups (15 min) vs weekly syncs cut feedback delay by 60%`;
  }

  if (m.includes("risk") || m.includes("security") || m.includes("audit") || m.includes("hack") || m.includes("exploit") || m.includes("vulnerab")) {
    return `Risk and security analysis for "${projectTitle}":

TOP SMART CONTRACT RISKS:
1. Reentrancy — use checks-effects-interactions pattern; consider ReentrancyGuard (OpenZeppelin)
2. Integer overflow/underflow — Solidity 0.8+ handles this natively, but verify library math
3. Oracle manipulation — never rely on spot prices; use Chainlink TWAP with a minimum observation window
4. Upgrade key compromise — use a multisig (3-of-5 Gnosis Safe) with a 48-hour timelock for all upgrades
5. Front-running — commit-reveal for any state that could be gamed by miners

TOP PROJECT RISKS (non-technical):
1. Talent quality mismatch — unverified credentials lead to poor code. SBT verification solves this.
2. Scope drift — the #1 cause of budget overruns. Freeze scope after architecture sprint.
3. Payment disputes — milestone escrow with objective acceptance criteria prevents 90% of disputes.

MITIGATION STACK:
• Audit: $20k–$50k (Trail of Bits, OpenZeppelin, Sherlock)
• Bug bounty: $5k–$20k post-launch to find remaining issues
• Multi-sig: Gnosis Safe for all treasury and admin operations
• Insurance: Nexus Mutual covers up to $25M for smart contract exploits (~1–3% annual premium)`;
  }

  if (m.includes("team") || m.includes("hire") || m.includes("talent") || m.includes("dev") || m.includes("engineer") || m.includes("who")) {
    return `Team composition for "${projectTitle}":

MINIMUM VIABLE TEAM:
• Lead Smart Contract Engineer (L2, 800+ rep) — the most critical hire. One bad contract can cost millions. Budget 60% of engineering time here.
• Full-Stack Developer (React + Web3) — dashboard, wallet integration, real-time UX
• Backend Engineer (Node.js / API) — REST + WebSocket layer, indexer integration, auth

IDEAL TEAM (if budget allows):
• + DevOps/Infra engineer for CI/CD, monitoring, deployment automation
• + QA engineer (often overlooked; contract testing is complex)
• + Technical writer for documentation (DAOs and protocols require good docs for community trust)

HOW TO EVALUATE WEB3 TALENT:
1. GitHub activity — look for meaningful contributions, not just forks
2. Prior protocol work — ask for mainnet contract addresses, verify on Etherscan
3. Test task — a small paid task (8–16 hrs) reveals actual code quality better than any interview
4. Community reputation — how do they show up in Discord/GitHub issues?

CULTURE FIT: Web3 devs often want async work, public visibility for their contributions, and token upside. Structure compensation accordingly.`;
  }

  if (m.includes("tech") || m.includes("stack") || m.includes("architecture") || m.includes("build") || m.includes("framework") || m.includes("infrastructure")) {
    return `Recommended tech stack for "${projectTitle}":

SMART CONTRACTS:
• Language: Solidity ^0.8.20
• Framework: Hardhat (testing + deployment) or Foundry (faster testing)
• Libraries: OpenZeppelin (audited base contracts), Chainlink (oracles)
• Chain: Polygon or Arbitrum for low gas; Ethereum mainnet for max trust

FRONTEND:
• React 18 + TypeScript + Vite (fast dev experience)
• Wagmi + Viem (type-safe wallet interactions, replacing ethers.js)
• RainbowKit (wallet connection UI — supports 100+ wallets out of the box)
• TanStack Query (server state, cache management)
• Tailwind CSS (consistent styling without CSS overhead)

BACKEND:
• Node.js + Express + TypeScript
• MongoDB (flexible schema for AI-scoped briefs and dynamic project data)
• Socket.io (real-time events — participant joins, ticket updates, NDA signing)
• Firebase Firestore (live chat — handles millions of concurrent connections managed)
• JWT authentication (stateless, scalable)

INFRA:
• AWS or GCP (multi-region for low latency)
• Cloudflare (CDN + DDoS protection)
• GitHub Actions (CI/CD — type checks, tests, deploy on merge)
• Alchemy or Infura (RPC node access — don't run your own node in year 1)`;
  }

  if (m.includes("revenue") || m.includes("monetiz") || m.includes("business model") || m.includes("make money") || m.includes("profit") || m.includes("arr") || m.includes("mrr")) {
    return `Revenue model for "${projectTitle}":

PRIMARY REVENUE STREAMS:

1. Platform Fee (transaction): 2–3% of every milestone released via escrow
   → At $1M monthly milestone volume = $20k–$30k MRR
   → Scales with usage, aligns with value delivered

2. Subscription (SaaS layer):
   • Starter: Free (1 active room, 3 AI features/month) — acquisition tier
   • Growth: $99/month (10 rooms, unlimited AI, analytics) — SMB sweet spot
   • Studio: $299/month (25 rooms, team features, priority support)
   • Enterprise: $999/month (unlimited, white-label, SLA, dedicated CSM)

3. Data Intelligence: Anonymized talent market rates, project pricing benchmarks
   → Quarterly reports sold to enterprises and recruiters at $5k–$15k per report

4. Credential Issuance: $50 per verified SBT (charged to talent)
   → Incentive: verified talent earns 5x more per project

UNIT ECONOMICS (projections):
• CAC: ~$120 (content + community led, not paid ads)
• LTV: ~$3,600 (3-year average, 2.5% monthly churn)
• LTV:CAC = 30:1 — strong SaaS benchmark (>3:1 = healthy)

BREAK-EVEN: ~50 paying Growth accounts + $500K monthly escrow volume`;
  }

  if (m.includes("go to market") || m.includes("gtm") || m.includes("launch") || m.includes("marketing") || m.includes("growth") || m.includes("user") || m.includes("acquire")) {
    return `Go-to-market strategy for "${projectTitle}":

PHASE 1 — SEEDING (Month 1–3):
• Identify 10 "anchor" Web3 protocols willing to be design partners (offer 6 months free)
• Personally recruit 50–100 top-tier verified developers before public launch
• Channels: ETHGlobal hackathons, Devcon, Twitter/X Web3 communities, Mirror.xyz articles
• Goal: 50 active rooms, 200 verified talent profiles, 3 publicly referenceable case studies

PHASE 2 — CONTENT ENGINE (Month 3–6):
• Weekly "Web3 Market Rate Report" — what does a Solidity L2 engineer cost this week?
• Case study format: "How [Protocol X] hired a verified squad in 48 hours"
• Talent creator program: devs write about their experience → platform credibility
• SEO target: "hire Solidity developer", "Web3 smart contract developer rates"
• Goal: 5,000 organic monthly visitors, 500 registered users

PHASE 3 — DIRECT SALES (Month 6–12):
• Outbound to funded Web3 protocols (Crunchbase + Messari funded list)
• SDR message: "How much are you spending on hiring + contractor disputes?"
• Conference presence: ETHDenver, Token2049, Consensus
• Partnership: offer credential issuance to Web3 bootcamps (supply side)
• Goal: 50 paying enterprise accounts, $500K ARR`;
  }

  if (m.includes("mvp") || m.includes("minimum") || m.includes("first version") || m.includes("v1") || m.includes("prototype") || m.includes("start")) {
    return `MVP scope for "${projectTitle}":

WHAT TO BUILD FIRST (P0 — hard launch blockers):
✓ Auth (email + JWT) — no wallet needed for MVP
✓ Room creation with AI scope brief
✓ Role posting + talent application/invite flow
✓ Real-time chat per room
✓ Ticket/kanban board
✓ Milestone tracker with amounts
✓ AI-generated NDA with digital signing
✓ Squad formation ("contracted" status)

WHAT TO DEFER (P1 — post-launch sprint):
□ On-chain SBT credentials (complex — fake it with off-chain badges first)
□ Actual escrow (use Stripe or manual bank transfer in MVP; build smart contract escrow in v1.1)
□ Google Meet/video integration
□ Email notifications
□ Mobile app

WHY THIS SCOPE:
• The on-chain escrow and SBT system are complex and need audit — doing them right takes 8–10 extra weeks
• The core value proposition (AI scoping + verified matching + collaborative contract signing) can be demonstrated without them
• Shipping a working MVP with 10 real customers teaches you more than 6 more months of building

TIMELINE TO MVP: 6–8 weeks with a team of 2–3 developers`;
  }

  return `Research question for "${projectTitle}": "${message}"

Here's my analysis based on what I know about Web3 product development:

The most important variables to consider here are:
1. Market timing — Web3 infrastructure adoption is accelerating even in bear markets; developer tooling and coordination platforms are counter-cyclical (builders keep building)
2. Technical feasibility — the EVM ecosystem is mature enough that most product ideas are technically executable; the question is team quality and execution speed
3. Distribution — building is the easy part in Web3; finding your first 100 users/clients who trust the platform is the hard part

For "${projectTitle}" specifically: the fact that you're asking about this suggests you've identified a real pain point. The best product research always starts from personal frustration.

I'd suggest we dig deeper into: (1) who specifically has this problem today and what do they use instead, (2) what's the smallest version you could put in front of 5 people in 4 weeks, and (3) what would have to be true for this to be a $10M ARR business.

Ask me about any of these threads and I'll go deep.`;
}

export function mockNda(projectTitle: string, businessName: string, talentNames: string, milestoneList: string): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `NON-DISCLOSURE AND PROJECT AGREEMENT
═══════════════════════════════════════════════════════════
DEHIX Live Room · Demo Mode · ${date}
═══════════════════════════════════════════════════════════

1. PARTIES

  Business Party: ${businessName}
  Development Team: ${talentNames || "To Be Confirmed"}
  Platform: DEHIX Live Room (facilitated agreement)

2. PROJECT SCOPE

  Project Title: ${projectTitle}
  This agreement covers all design, development, testing, and deployment work
  associated with the above-named project as further described in the project
  brief attached to this Live Room session.

3. CONFIDENTIALITY OBLIGATIONS

  Both parties agree to keep all project-related information — including code,
  architecture, tokenomics, business logic, and user data — strictly confidential
  for a period of TWO (2) YEARS from the date of signing.

  Neither party may disclose any proprietary information to third parties without
  prior written consent from all signatories.

4. INTELLECTUAL PROPERTY

  All code, designs, smart contracts, and documentation produced under this
  agreement become the sole property of the Business Party upon receipt of full
  payment per the milestone schedule below. Prior to full payment, all work
  remains the property of the individual contributors.

5. PAYMENT TERMS — MILESTONE-BASED ESCROW

  ${milestoneList || "Milestones to be defined in the Live Room milestone tab."}

  Funds are held in escrow on the DEHIX platform and released upon milestone
  approval by the Business Party. No milestone payment may be withheld for more
  than 7 days after delivery without written justification.

6. DISPUTE RESOLUTION

  Any disputes shall be submitted to DEHIX Oracle Arbitration — a decentralized
  panel of three independent Web3 professionals selected by the platform.
  The arbitration decision is final and binding.

7. GOVERNING LAW

  This agreement is governed by the principles of smart-contract-native
  jurisdiction. Where local law applies, the parties agree to the jurisdiction
  of [the applicable region]. On-chain execution supersedes off-chain disputes.

8. SIGNATURES

  By signing below, all parties agree to the terms of this agreement.

  Business Party: ${businessName}
  Signature: _________________________ Date: _________

  ${(talentNames || "Talent TBD").split(", ").map((name: string) => `Developer: ${name}\n  Signature: _________________________ Date: _________`).join("\n\n  ")}

═══════════════════════════════════════════════════════════
This document was generated in DEMO MODE by DEHIX Live Room.
Connect AI keys for a fully customized, legally-reviewed NDA.
═══════════════════════════════════════════════════════════`;
}

export function mockMilestones(totalBudgetUsd: number) {
  const now = new Date();
  const addWeeks = (w: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + w * 7);
    return d.toISOString().split("T")[0];
  };
  return [
    { title: "Architecture & Spec", description: "Tech stack finalized, contracts spec approved, wireframes signed off", amountUsd: Math.round(totalBudgetUsd * 0.15), dueDate: addWeeks(2) },
    { title: "Core Build", description: "Smart contracts on testnet, API endpoints live, basic frontend scaffolded", amountUsd: Math.round(totalBudgetUsd * 0.35), dueDate: addWeeks(7) },
    { title: "Integration & Testing", description: "Full frontend + contract integration, QA pass, staging deployment", amountUsd: Math.round(totalBudgetUsd * 0.35), dueDate: addWeeks(10) },
    { title: "Audit & Launch", description: "Security audit complete, mainnet deployment, 30-day support window begins", amountUsd: Math.round(totalBudgetUsd * 0.15), dueDate: addWeeks(12) },
  ];
}
