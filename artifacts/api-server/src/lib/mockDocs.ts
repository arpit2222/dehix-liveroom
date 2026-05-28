export interface ConvMsg {
  userName: string;
  message: string;
  isAi: boolean;
}

function extractCtx(messages: ConvMsg[], projectTitle: string) {
  const allText = messages.map((m) => m.message).join(" ");
  const lower = allText.toLowerCase();

  const isWeb3 = /blockchain|defi|nft|crypto|web3|token|smart.?contract|dao|dex|wallet|ethereum|solana|polygon|layer.?2/i.test(allText);
  const isAI = /machine.?learning|artificial.?intelligence|llm|gpt|neural|model|training|inference/i.test(allText);
  const isMarketplace = /marketplace|platform|buyers|sellers|two.?sided|supply|demand/i.test(allText);
  const isSaaS = /saas|subscription|b2b|enterprise|dashboard|analytics/i.test(allText);

  const budgetMatch = allText.match(/\$[\d,]+(?:k|m|K|M)?|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand|k)\b/i);
  const budget = budgetMatch?.[0] ?? "$80,000";
  const timelineMatch = allText.match(/(\d+)\s*(?:weeks?|months?|sprints?)/i);
  const timeline = timelineMatch?.[0] ?? "12 weeks";
  const teamMatch = allText.match(/(\d+)\s*(?:developers?|engineers?|people|team members?)/i);
  const teamSize = teamMatch?.[0] ?? "4 developers";

  const humanMsgs = messages.filter((m) => !m.isAi).map((m) => m.message);
  const aiMsgs = messages.filter((m) => m.isAi).map((m) => m.message);

  const domain = isWeb3 ? "Web3 / Blockchain" : isAI ? "AI / Machine Learning" : isMarketplace ? "Marketplace" : isSaaS ? "SaaS" : "Technology";

  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return { allText, lower, isWeb3, isAI, isMarketplace, isSaaS, budget, timeline, teamSize, humanMsgs, aiMsgs, domain, date };
}

const DIVIDER = "═══════════════════════════════════════════════════════════";
const LINE = "───────────────────────────────────────────────────────────";

export function mockPitchDeck(messages: ConvMsg[], projectTitle: string): string {
  const c = extractCtx(messages, projectTitle);
  const summary = c.humanMsgs.slice(0, 3).join(" ").slice(0, 200);

  return `${DIVIDER}
PITCH DECK
${projectTitle.toUpperCase()}
Domain: ${c.domain} · Generated: ${c.date}
${DIVIDER}

SLIDE 1 — COVER
${LINE}
${projectTitle}
"${c.isWeb3 ? "Redefining trust and value exchange on-chain" : c.isAI ? "Making intelligence accessible and actionable" : "Building the infrastructure tomorrow needs"}"

Confidential · For investor review only


SLIDE 2 — THE PROBLEM
${LINE}
The market today has a clear gap:

• Current solutions are fragmented, slow, or prohibitively expensive
• ${c.isWeb3 ? "Existing Web3 products fail on UX — they serve insiders, not mainstream users" : "Existing platforms are closed ecosystems that don't interoperate"}
• ${c.isAI ? "AI-powered tooling lacks domain specificity and auditability" : "There is no unified layer that serves all stakeholder needs simultaneously"}
• Teams waste 40–60% of their collaboration time on coordination overhead

Research context from your conversation:
"${summary.slice(0, 180)}..."


SLIDE 3 — OUR SOLUTION
${LINE}
${projectTitle} is a ${c.domain} platform that solves this by:

1. [CORE FEATURE]: A seamless, on-chain-verified workflow layer
2. [DIFFERENTIATOR]: ${c.isWeb3 ? "Reputation-gated access so only qualified actors participate" : "AI-assisted matching and document generation"}
3. [NETWORK EFFECT]: Each participant makes the platform more valuable for everyone else
4. [MOAT]: Verifiable credentials and audit trails that competitors cannot replicate

Result: 70% reduction in hiring/contracting cycle time


SLIDE 4 — MARKET SIZE
${LINE}
Total Addressable Market (TAM)
${c.isWeb3 ? "Global blockchain professional services: $67B by 2026 (Gartner)" : "Global B2B SaaS market: $702B by 2030 (Grand View Research)"}

Serviceable Addressable Market (SAM)
${c.isWeb3 ? "Decentralized talent & project management: $4.2B" : "Target segment — mid-market tech companies: $48B"}

Serviceable Obtainable Market (SOM) — Year 3
${c.isWeb3 ? "0.5% market share = $21M ARR" : "0.1% market share = $48M ARR"}

Tailwind: ${c.isWeb3 ? "DeFi TVL and on-chain activity growing 35% YoY despite bear markets" : "Remote-first and distributed team adoption accelerating post-2023"}


SLIDE 5 — PRODUCT
${LINE}
How it works:

Step 1 → ${c.isWeb3 ? "Business creates a Live Room with AI-scoped project brief" : "User onboards and defines their project requirements"}
Step 2 → ${c.isWeb3 ? "Verified talent (SBT credentials) apply for roles" : "Platform matches them with verified service providers"}
Step 3 → ${c.isWeb3 ? "Squad assembles, NDA is signed on-chain, milestones locked in escrow" : "Agreement is formed with milestone-based payment terms"}
Step 4 → ${c.isWeb3 ? "Work completed, milestones released, credentials issued" : "Deliverables are reviewed and payment released automatically"}

Key capabilities:
• AI-powered scope, matching, and document generation
• ${c.isWeb3 ? "SBT (Soul-Bound Token) credential verification" : "Verified identity and track record system"}
• Real-time collaboration (chat, video, shared workspace)
• Milestone-based escrow with dispute resolution


SLIDE 6 — BUSINESS MODEL
${LINE}
Revenue streams:

1. Platform Fee: ${c.isWeb3 ? "2.5% of every milestone released through escrow" : "8–15% transaction fee on completed projects"}
   → Aligns with value delivered

2. Subscription Tiers:
   • Starter (free): 1 active room
   • Growth ($99/mo): 10 rooms + analytics
   • Enterprise ($499/mo): Unlimited + white-label + dedicated support

3. ${c.isWeb3 ? "Credential Issuance: $50 per verified SBT credential" : "Premium matching: $200/month for priority talent access"}

4. Data & Intelligence: Anonymized market rate data sold to enterprises

Unit Economics:
• CAC: ~$120 (content + community)
• LTV: ~$3,600 (3-year average customer)
• LTV:CAC = 30:1


SLIDE 7 — TRACTION
${LINE}
Current Status (Demo / Pre-Launch):

✓ Full product built — end-to-end Live Room working
✓ ${c.isWeb3 ? "6 demo accounts with verified SBT credentials seeded" : "Core matching and collaboration platform live"}
✓ AI scope, document generation, and NDA flow operational
✓ MongoDB + real-time Socket.io infrastructure deployed

Pipeline:
• [3 pilot customers in conversations]
• [Letter of intent from 1 enterprise account]
• [2 Web3 protocols interested in partnerships]


SLIDE 8 — COMPETITIVE LANDSCAPE
${LINE}
Competitors and why we win:

                    ${projectTitle.slice(0, 12).padEnd(14)} | Upwork   | Toptal  | Braintrust
${LINE.slice(0, 60)}
On-chain verified   ✓                | ✗       | ✗       | Partial
AI scoping          ✓                | ✗       | ✗       | ✗
Real-time collab    ✓                | Limited | ✗       | ✗
Escrow built-in     ✓                | External| External| ✓
Reputation portable ✓ (SBT)         | ✗       | ✗       | Partial

Our defensible moat: verifiable on-chain reputation that follows the individual


SLIDE 9 — TEAM
${LINE}
[Founding Team — to be completed]

CEO / Product: [Name] — Background in product and Web3 ecosystems
CTO / Engineering: [Name] — Full-stack + smart contract experience
Head of Growth: [Name] — Community and BD background

Advisors:
• [Web3 Protocol Founder]
• [Ex-Sequoia / a16z crypto]

Open roles: Senior Solidity Engineer, Head of Partnerships


SLIDE 10 — FINANCIALS
${LINE}
Use of Funds (${c.budget} raise):

40% — Engineering (2 senior hires)
25% — Growth / Marketing
20% — Operations & Legal
15% — Reserve

12-Month Targets:
• 500 active rooms created
• $2M in milestone escrow processed
• 50 enterprise accounts
• Breakeven at 18 months


SLIDE 11 — THE ASK
${LINE}
Raising: ${c.budget} (Seed Round)
Structure: SAFE Note, ${c.isWeb3 ? "20% discount, $10M cap" : "20% discount, $15M cap"}

What this gets us:
→ ${c.timeline} to full market launch
→ ${c.teamSize} hired and delivering
→ 10 design partners signed
→ $500K ARR run rate

Contact: [founder@${projectTitle.toLowerCase().replace(/\s+/g, "")}.xyz]

${DIVIDER}
Generated by DEHIX Live Room · Document Mode · ${c.date}
Based on ${messages.length} research conversation messages
${DIVIDER}`;
}

export function mockTechnicalDeck(messages: ConvMsg[], projectTitle: string): string {
  const c = extractCtx(messages, projectTitle);

  return `${DIVIDER}
TECHNICAL DECK
${projectTitle.toUpperCase()}
Domain: ${c.domain} · Generated: ${c.date}
${DIVIDER}

SECTION 1 — ARCHITECTURE OVERVIEW
${LINE}
${projectTitle} is built on a three-tier architecture:

┌─────────────────────────────────────────────────────┐
│                   CLIENT LAYER                       │
│  React + Vite · TypeScript · Socket.io client        │
│  Wallet Connect (${c.isWeb3 ? "RainbowKit / WalletConnect" : "OAuth 2.0"})              │
└─────────────┬───────────────────────────────────────┘
              │ HTTPS / WSS
┌─────────────▼───────────────────────────────────────┐
│                  API LAYER                           │
│  Express.js + Node.js · Socket.io · JWT Auth         │
│  OpenAI Integration · Firebase Firestore (chat)      │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│                  DATA LAYER                          │
│  MongoDB (primary store) · ${c.isWeb3 ? "IPFS (credential metadata)" : "PostgreSQL (analytics)"}   │
│  ${c.isWeb3 ? "Ethereum/Polygon (on-chain credentials + escrow)" : "Redis (caching + sessions)"}           │
└─────────────────────────────────────────────────────┘


SECTION 2 — TECHNOLOGY STACK
${LINE}
Frontend:
• React 18 + TypeScript + Vite
• Tailwind CSS + Radix UI (accessible components)
• TanStack Query (server state management)
• Socket.io client (real-time events)
• ${c.isWeb3 ? "Ethers.js / Viem + Wagmi (wallet interactions)" : "Auth.js + OAuth providers"}

Backend:
• Node.js + Express.js + TypeScript
• Socket.io (WebSocket layer)
• Mongoose + MongoDB (primary data store)
• Firebase Firestore (real-time chat)
• Azure OpenAI (AI features)
• JWT (stateless authentication)
• Pino (structured logging)

${c.isWeb3 ? `Blockchain:
• EVM-compatible (Ethereum + Polygon mainnet)
• Solidity ^0.8.20 (smart contracts)
• Hardhat (development + testing framework)
• OpenZeppelin (battle-tested contract libraries)
• Chainlink (price feeds + VRF for oracle data)

` : ""}Infrastructure:
• Docker + Kubernetes (production)
• GitHub Actions (CI/CD)
• AWS/GCP (cloud hosting)
• Cloudflare (CDN + DDoS protection)


SECTION 3 — KEY TECHNICAL DECISIONS
${LINE}
Decision 1: MongoDB over PostgreSQL
Rationale: Schema flexibility for AI-scoped briefs (dynamic JSON), 
easier horizontal sharding for multi-tenant data.
Trade-off: Weaker ACID guarantees — mitigated by Mongoose validation 
and application-level transactions.

Decision 2: Socket.io over raw WebSockets
Rationale: Automatic fallback to long-polling, built-in room concept, 
event namespacing matches our multi-room architecture.
Trade-off: Larger payload overhead — acceptable at our current scale.

Decision 3: ${c.isWeb3 ? "Soul-Bound Tokens for credentials" : "Verifiable Credentials (W3C standard)"}
Rationale: ${c.isWeb3 ? "Non-transferable NFTs ensure credentials follow the individual, cannot be sold or spoofed. Permanent on-chain record." : "Open standard enables portability across platforms, cryptographic verification without centralized authority."}
Trade-off: ${c.isWeb3 ? "Gas costs on credential issuance — mitigated by using Polygon L2." : "Implementation complexity — mitigated by using established VC libraries."}

Decision 4: Firebase for live chat (vs. custom WebSocket store)
Rationale: Managed real-time database with offline sync, scales to 
millions of concurrent connections out of the box.
Trade-off: Vendor dependency — mitigated by keeping chat as a 
separable module with clean abstraction layer.

Decision 5: Azure OpenAI for AI workflows
Rationale: Uses a managed Azure OpenAI deployment with explicit
environment-based key and endpoint configuration.
Trade-off: Dependency on Azure OpenAI availability — mitigated by mock
fallbacks for all AI features.


SECTION 4 — DATA MODELS
${LINE}
Core collections (MongoDB, prefixed test_livechat_):

users          → _id, email, name, role, walletAddress, isOnline, reputation
live_rooms     → _id, businessId, title, status, roomCode, aiScopedBrief, meetLink
room_roles     → _id, roomId, roleTitle, skillDomain, requiredLevel, status
room_participants → _id, roomId, userId, status (invited|joined|declined)
tickets        → _id, roomId, title, status (backlog|todo|in_progress|done)
milestones     → _id, roomId, title, amountUsd, status (pending|in_progress|released)
sbt_credentials → _id, userId, skillDomain, level, reputationScore, onChainTx
ndas           → _id, roomId, content, signedBy[], status
generated_docs → _id, roomId, documentType, title, content, messageCount


SECTION 5 — SECURITY MODEL
${LINE}
Authentication:
• JWT tokens (HS256), 7-day expiry, stored in localStorage
• Token rotation on sensitive operations
• Rate limiting: 100 req/min per IP (express-rate-limit)

Authorization:
• Role-based: talent | business
• Resource-level: room ownership verified on every mutation
• Socket.io: room join validated against participant list

${c.isWeb3 ? `On-chain Security:
• Smart contracts audited before mainnet (minimum $15K audit)
• Multi-sig for contract upgrades (3-of-5 threshold)
• Emergency pause mechanism on all escrow contracts
• Reentrancy guards on all value-transferring functions
• Oracle manipulation protection via Chainlink TWAP

` : ""}Data Security:
• HTTPS/TLS 1.3 everywhere
• MongoDB Atlas encrypted at rest (AES-256)
• Sensitive fields (walletAddress, email) access-logged
• GDPR-compliant: data export and deletion endpoints


SECTION 6 — SCALABILITY PLAN
${LINE}
Current capacity (single node):
• ~500 concurrent WebSocket connections
• ~1,000 requests/second
• ~10GB storage

Phase 2 (6–12 months, 10K users):
• Horizontal API scaling (3+ Node.js instances behind load balancer)
• MongoDB Atlas sharding on roomId
• Redis for session caching and rate limiting
• CDN for static assets (Cloudflare)

Phase 3 (12–24 months, 100K users):
• Microservices split: auth, rooms, AI, notifications
• Event-driven architecture (Kafka/SQS for async processing)
• Multi-region deployment (US + EU + APAC)
• Read replicas for analytics queries


SECTION 7 — API DESIGN
${LINE}
RESTful API (base: /api):

Auth:      POST /auth/register, POST /auth/login, POST /auth/logout
Rooms:     GET/POST /rooms, GET /rooms/:id, POST /rooms/:id/invite
Tickets:   GET/POST /rooms/:id/tickets, PATCH /tickets/:id
Milestones: GET/POST /rooms/:id/milestones
NDA:       GET /rooms/:id/nda, POST /rooms/:id/nda/sign
AI:        POST /ai/scope, POST /ai/match, POST /ai/chat, POST /ai/generate-document
Talent:    GET /talent/:id/profile, GET /talent/:id/credentials

WebSocket events:
• room:join, room:participant_joined
• room:ticket_updated, room:milestone_updated
• room:nda_signed, room:squad_formed

Response envelope: { data, error?, meta? }
Error codes: 400 (validation), 401 (unauth), 403 (forbidden), 404, 429 (rate limit), 500


SECTION 8 — DEVELOPMENT ROADMAP
${LINE}
Sprint 1–2 (Weeks 1–4): Foundation
□ Monorepo setup, CI/CD pipeline
□ Auth + user management complete
□ Core room CRUD + WebSocket layer

Sprint 3–4 (Weeks 5–8): Core Features
□ ${c.isWeb3 ? "Smart contract deployment on testnet" : "Payment integration (Stripe)"}
□ AI integration (scope, match, chat)
□ Ticket + milestone management

Sprint 5–6 (Weeks 9–12): Polish & Launch
□ ${c.isWeb3 ? "Mainnet deployment + contract audit" : "Enterprise features + SSO"}
□ Performance optimization
□ Security audit
□ Public beta launch

Estimated: ${c.timeline} with ${c.teamSize}

${DIVIDER}
Generated by DEHIX Live Room · Document Mode · ${c.date}
Based on ${messages.length} research conversation messages
${DIVIDER}`;
}

export function mockBdStrategy(messages: ConvMsg[], projectTitle: string): string {
  const c = extractCtx(messages, projectTitle);

  return `${DIVIDER}
BD STRATEGY DOCUMENT
${projectTitle.toUpperCase()}
Domain: ${c.domain} · Generated: ${c.date}
${DIVIDER}

1. MARKET OPPORTUNITY
${LINE}
Primary Market: ${c.isWeb3 ? "Decentralized talent and project management" : "B2B tech collaboration and hiring"}

Market signals:
• ${c.isWeb3 ? "250,000+ active Web3 developers globally (Electric Capital Dev Report)" : "Global freelance market: $1.5T by 2027"}
• ${c.isWeb3 ? "DAO treasuries now managing $22B+ (DeepDAO)" : "Remote team adoption: 58% of companies now have distributed teams"}
• Average project failure rate due to poor vetting: 67% (McKinsey Digital)
• Average time-to-hire for verified technical talent: 6–8 weeks

${projectTitle} opportunity: compress that to < 72 hours with AI + verified credentials


2. TARGET CUSTOMER SEGMENTS
${LINE}
SEGMENT A — PRIMARY: ${c.isWeb3 ? "Web3 Protocol Teams / DAOs" : "Tech Scale-ups (50–500 employees)"}
  Profile: ${c.isWeb3 ? "Teams building DeFi, NFT, or infrastructure products needing verified devs" : "Fast-growing SaaS companies with sporadic engineering demand"}
  Pain: ${c.isWeb3 ? "Can't vet Solidity devs through traditional channels; reputation is unverifiable" : "Hiring too slow for sprint needs; contractors unreliable without track record"}
  Budget: ${c.isWeb3 ? "$50K–$500K per project" : "$20K–$200K per engagement"}
  Decision maker: CTO, Head of Engineering, DAO governance council

SEGMENT B — SECONDARY: ${c.isWeb3 ? "Enterprise Blockchain Teams (banks, supply chain)" : "Digital Agencies (building for clients)"}
  Profile: ${c.isWeb3 ? "Large corporations piloting blockchain infrastructure" : "Agencies managing multiple client projects simultaneously"}
  Pain: ${c.isWeb3 ? "Cannot find auditable blockchain talent through normal recruiters" : "Need flexible talent pools; client budgets vary widely"}
  Budget: ${c.isWeb3 ? "$500K–$5M per engagement" : "$30K–$300K per project"}

SEGMENT C — TALENT SIDE: ${c.isWeb3 ? "Verified Web3 Developers" : "Senior Tech Professionals"}
  Profile: ${c.isWeb3 ? "Solidity, frontend, backend engineers with verifiable on-chain track records" : "Engineers, designers, PMs with portfolios and references"}
  Pain: "My credentials don't travel — every client needs me to prove myself from scratch"
  Value prop: Portable, verified reputation that opens higher-quality opportunities


3. VALUE PROPOSITION BY SEGMENT
${LINE}
For businesses:
→ Hire verified talent in < 72 hours (vs. 6–8 weeks industry standard)
→ AI-scoped project brief → no back-and-forth on requirements
→ Milestone escrow → zero payment risk
→ Legally binding NDA + SOW generated in seconds

For talent:
→ Your reputation is yours — verified, portable, on-chain
→ Work on interesting projects without the cold-application grind
→ Get paid on milestones — no invoicing, no net-60 payment delays
→ Build your SBT credential profile with every completed project


4. GO-TO-MARKET STRATEGY
${LINE}
PHASE 1: Community Seeding (Months 1–3)
  • Identify 10 "anchor" ${c.isWeb3 ? "Web3 protocols" : "tech companies"} for design partnership
  • Offer: first 6 months free in exchange for testimonials + feedback
  • Channels: ${c.isWeb3 ? "ETHGlobal, Devcon, Web3 Discord servers, Mirror.xyz articles" : "ProductHunt, Hacker News, relevant Slack communities, LinkedIn"}
  • Goal: 50 active rooms, 200 verified talent profiles

PHASE 2: Content + SEO (Months 3–6)
  • Weekly market rate reports (${c.isWeb3 ? "What does a Solidity L2 engineer cost?" : "Engineering rate benchmarks by role and region"})
  • Case studies: documented project success stories
  • Creator program: talent write about their experience → platform credibility
  • Goal: 5,000 organic monthly visitors, 500 registered users

PHASE 3: Direct Sales (Months 6–12)
  • Outbound to ${c.isWeb3 ? "funded Web3 protocols (Crunchbase + Messari)" : "VC-backed startups in target verticals"}
  • SDR playbook: "How much are you spending on hiring + contractor disputes?"
  • Conference presence: ${c.isWeb3 ? "ETHDenver, Token2049, Consensus" : "SaaStr, DevRelCon, Slush"}
  • Goal: 50 paying enterprise accounts, $500K ARR


5. PARTNERSHIP STRATEGY
${LINE}
TIER 1 — Integration Partners
  • ${c.isWeb3 ? "Wallet providers: MetaMask, Coinbase Wallet (login + credential signing)" : "Auth providers: Clerk, Auth0 (identity verification)"}
  • AI: Azure OpenAI, Anthropic (document generation + matching)
  • Video: Google Meet, Whereby, Loom (collaboration layer)
  • Value: Mutual distribution; we drive users to their tools

TIER 2 — Channel Partners
  • ${c.isWeb3 ? "Web3 accelerators: a16z crypto, Paradigm, Multicoin portfolio companies" : "Venture studios and incubators"}
  • Bootcamps + dev education: offer credential issuance to graduates
  • Value: Access to qualified talent supply

TIER 3 — Strategic Partners
  • ${c.isWeb3 ? "L2 networks (Polygon, Arbitrum): co-marketing + grant funding for deploying on their chain" : "Enterprise HR platforms: ATS integrations"}
  • Value: Shared ecosystem growth


6. REVENUE MODEL & PRICING
${LINE}
Transaction Revenue (primary, 40% of total):
  • 2.5% fee on every milestone released via escrow
  • No fee if project is abandoned before start

Subscription Revenue (35% of total):
  Starter: FREE — 1 active room, 3 AI features/month
  Growth: $99/month — 10 active rooms, unlimited AI, analytics
  Studio: $299/month — 25 rooms, team features, priority support
  Enterprise: $999/month — unlimited, white-label, SLA, dedicated CSM

Data Revenue (15% of total):
  • Market rate intelligence reports (quarterly, $5K/report)
  • API access to talent pool data for enterprise HR tools

Credential Revenue (10% of total):
  • $50 per verified SBT credential issuance
  • Bulk packages for bootcamps/academies


7. SALES PROCESS
${LINE}
Lead → ICP filter (company size, budget signal, tech stack)
  ↓
Outreach → Personalized problem framing (not product pitch)
  ↓
Demo → 20-min live walk-through of a room with real AI scoping
  ↓
Pilot → 30-day free trial with dedicated onboarding support
  ↓
Conversion → Growth/Studio plan, milestone-based upsell
  ↓
Expansion → More rooms, team seats, enterprise upgrade

Average sales cycle: 14 days (SMB), 60 days (Enterprise)


8. KPIs & SUCCESS METRICS
${LINE}
North Star: Total Milestone Value Processed (TMVP)
Target: $1M TMVP within 12 months

Monthly KPIs:
• Rooms Created (target: 50/month → 200/month by month 12)
• Talent Profiles (target: 500 total by month 6)
• Platform Fee Revenue (target: $10K MRR by month 6)
• Time-to-Hire (target: < 72 hours from room creation)
• NPS (target: > 50)

Cohort Metrics:
• D30 room completion rate (target: > 65%)
• Business retention (target: > 80% create 2nd room within 90 days)
• Talent retention (target: > 60% accept 2nd invite within 60 days)

${DIVIDER}
Generated by DEHIX Live Room · Document Mode · ${c.date}
Based on ${messages.length} research conversation messages
${DIVIDER}`;
}

export function mockSow(messages: ConvMsg[], projectTitle: string): string {
  const c = extractCtx(messages, projectTitle);
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 84);

  return `${DIVIDER}
STATEMENT OF WORK (SOW)
${projectTitle.toUpperCase()}
Generated: ${c.date}
${DIVIDER}

1. PROJECT OVERVIEW
${LINE}
Project Name:    ${projectTitle}
Client:          [Business Party Name] ("Client")
Service Provider: DEHIX Squad — [Squad Name] ("Provider")
Effective Date:  ${startDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
Target End Date: ${endDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
Domain:          ${c.domain}
Total Value:     ${c.budget}

Executive Summary:
This Statement of Work governs the design, development, testing, and deployment 
of ${projectTitle}. All work is performed under the terms of the master NDA and 
project agreement signed via DEHIX Live Room. Scope changes require a written 
change order signed by both parties.


2. SCOPE OF WORK
${LINE}
IN SCOPE — the Provider agrees to deliver:

✓ Architecture design and technical specification document
✓ ${c.isWeb3 ? "Smart contract development, testing, and testnet deployment" : "Backend API development (REST + WebSocket)"}
✓ Frontend application (React/TypeScript) — all screens defined in wireframes
✓ ${c.isWeb3 ? "On-chain credential system integration" : "Authentication, authorization, and user management"}
✓ AI integration (scoping, matching, document generation)
✓ Unit tests (minimum 80% coverage on business logic)
✓ Integration tests for all API endpoints
✓ Deployment to staging environment
✓ ${c.isWeb3 ? "Mainnet deployment + contract verification on Etherscan" : "Production deployment on agreed cloud infrastructure"}
✓ 30-day post-launch support window

OUT OF SCOPE — not included unless via change order:
✗ Mobile applications (iOS / Android)
✗ ${c.isWeb3 ? "Formal security audit (recommended separately, $15K–$50K)" : "Legacy system migration"}
✗ Ongoing maintenance after 30-day support window
✗ Third-party integrations beyond those listed above
✗ Custom design system (standard Tailwind/Radix components used)


3. DELIVERABLES
${LINE}
MILESTONE 1 — Architecture & Specification
  Deliverables:
  • Technical architecture document (approved by Client)
  • ${c.isWeb3 ? "Smart contract interface specification" : "API contract (OpenAPI spec)"}
  • UI wireframes + component inventory
  • Development environment setup guide
  Due: End of Week 2

MILESTONE 2 — Core Infrastructure
  Deliverables:
  • ${c.isWeb3 ? "Smart contracts deployed and verified on testnet" : "Database schema + migrations applied"}
  • Authentication system (register, login, JWT)
  • Core API routes (rooms, users, basic CRUD)
  • CI/CD pipeline operational
  Due: End of Week 6

MILESTONE 3 — Feature Complete
  Deliverables:
  • All in-scope features implemented
  • AI integration working end-to-end
  • ${c.isWeb3 ? "Frontend wallet integration + on-chain reads/writes" : "Full frontend application"}
  • Staging environment deployed + accessible to Client
  Due: End of Week 10

MILESTONE 4 — Launch
  Deliverables:
  • All Milestone 3 feedback items resolved
  • ${c.isWeb3 ? "Mainnet deployment + contract verification" : "Production deployment"}
  • Load testing report (target: 100 concurrent users)
  • Handover documentation (runbook, architecture diagram, credentials)
  • 30-day support window begins
  Due: End of Week 12


4. TIMELINE
${LINE}
Week 1–2:   Architecture & design (Milestone 1)
Week 3–6:   Core infrastructure build (Milestone 2)
Week 7–10:  Feature development (Milestone 3)
Week 11–12: QA, performance, deployment (Milestone 4)
Week 13–16: 30-day post-launch support

Total duration: ${c.timeline}
Note: Timeline assumes Client provides feedback within 3 business days of each 
deliverable submission. Delays in Client feedback extend timeline proportionally.


5. TEAM STRUCTURE
${LINE}
Provider team for this engagement:

Role                  | Person            | Allocation | Rate
${LINE.slice(0, 55)}
Lead Engineer         | [Name — TBC]      | 100%       | $150/hr
${c.isWeb3 ? "Smart Contract Eng.   | [Name — TBC]      | 100%       | $180/hr" : "Backend Engineer      | [Name — TBC]      | 100%       | $130/hr"}
Frontend Engineer     | [Name — TBC]      | 100%       | $120/hr
QA / DevOps           | [Name — TBC]      | 50%        | $100/hr

All team members have verified credentials on DEHIX (minimum L1, 500+ reputation).
Team composition changes require 5-business-day notice and Client approval.


6. ASSUMPTIONS & DEPENDENCIES
${LINE}
This SOW assumes:

Client responsibilities:
□ Provide brand assets (logo, colors, fonts) by Week 1, Day 3
□ Provide access to any existing systems/APIs within 5 business days
□ Designate a single point of contact for feedback and approvals
□ Review and approve deliverables within 3 business days
□ ${c.isWeb3 ? "Fund escrow wallet with full project amount before work begins" : "Initiate escrow payment per milestone schedule"}

Technical dependencies:
□ Azure OpenAI access (Provider responsibility)
□ ${c.isWeb3 ? "Alchemy/Infura node access (Provider responsibility)" : "Cloud infrastructure provisioned (Provider responsibility)"}
□ Firebase project created (Provider responsibility)
□ Domain + SSL certificate (Client responsibility)


7. CHANGE MANAGEMENT
${LINE}
Any work outside this SOW requires a signed Change Order including:
• Description of additional scope
• Timeline impact
• Cost impact (fixed fee or hourly rate: $140/hr blended)
• Signatures from both parties

Change requests take 3 business days to estimate.
Provider is not obligated to begin change work until Change Order is signed.
Change Orders may extend the project timeline.


8. PAYMENT SCHEDULE (MILESTONE ESCROW)
${LINE}
Payment is released from DEHIX escrow upon Client approval of each milestone.

Milestone 1 — Architecture:    15% of ${c.budget}
Milestone 2 — Core Build:      35% of ${c.budget}
Milestone 3 — Feature Complete: 35% of ${c.budget}
Milestone 4 — Launch:          15% of ${c.budget}
                                ────────────────
Total:                          100% = ${c.budget}

If Client does not approve or reject a milestone within 5 business days of 
submission, it is deemed approved and funds are released automatically.

Dispute resolution: DEHIX Oracle Arbitration (3 independent arbitrators).


9. ACCEPTANCE CRITERIA
${LINE}
Each milestone is accepted when:
✓ All listed deliverables are present and functional
✓ No P0/P1 bugs outstanding (critical blockers / major functionality broken)
✓ Code passes CI (linting + type checks + unit tests)
✓ Client has completed review within the review window
✓ ${c.isWeb3 ? "Smart contracts verified on block explorer" : "API endpoints return expected responses per OpenAPI spec"}

Definition of Done for each ticket:
• Implemented per requirements
• Unit test written
• Code reviewed by one other team member
• Deployed to staging and smoke-tested


10. SIGNATURES
${LINE}
By signing below, both parties agree to the terms of this Statement of Work.

Client: ___________________________________ Date: ____________
  Name:    [Client Name]
  Title:   [Title]
  Company: [Company Name]

Provider: _________________________________ Date: ____________
  Name:    [Lead Engineer Name]
  Title:   Lead Engineer / Squad Lead
  Platform: DEHIX Live Room

${DIVIDER}
Generated by DEHIX Live Room · Document Mode · ${c.date}
Based on ${messages.length} research conversation messages
${DIVIDER}`;
}

export function mockProjectBrief(messages: ConvMsg[], projectTitle: string): string {
  const c = extractCtx(messages, projectTitle);

  return `${DIVIDER}
PROJECT BRIEF
${projectTitle.toUpperCase()}
Domain: ${c.domain} · Generated: ${c.date}
${DIVIDER}

1. EXECUTIVE SUMMARY
${LINE}
${projectTitle} is a ${c.domain} platform designed to solve the coordination 
and trust gap in ${c.isWeb3 ? "decentralized project execution" : "distributed technical hiring"}.

Research context from your conversation:
${c.humanMsgs.slice(0, 3).map((m, i) => `  ${i + 1}. "${m.slice(0, 120)}${m.length > 120 ? "..." : ""}"`).join("\n")}

Key insight: The problem is not a lack of talent or capital — it's the 
absence of a trusted, verifiable coordination layer between the two.

Proposed approach: Build a real-time, AI-assisted platform with verifiable 
credentials, milestone escrow, and structured collaboration tooling.

Estimated budget: ${c.budget}
Estimated timeline: ${c.timeline}
Team required: ${c.teamSize}


2. BACKGROUND & CONTEXT
${LINE}
Current state of the market:
• Traditional hiring platforms (Upwork, Toptal) lack on-chain verification
• Smart contract talent pools are unvetted — credentials are self-reported
• Project failures correlate directly with poor vetting + unclear contracts
• Average Web3 project runs 35% over budget due to scope creep

Why now:
• ${c.isWeb3 ? "Layer 2 maturity makes gas costs viable for credential issuance ($0.01–$0.10)" : "LLM-powered matching is now accurate enough to automate first-pass filtering"}
• Remote-first culture is permanent — the tooling needs to catch up
• Trust infrastructure is the missing layer; product-market fit is clear


3. BUSINESS OBJECTIVES
${LINE}
Primary objectives:
1. Reduce time-to-hire for verified ${c.isWeb3 ? "Web3" : "technical"} talent from 6 weeks → < 72 hours
2. Reduce project payment disputes by 80% via milestone escrow
3. Build the largest network of verified ${c.isWeb3 ? "on-chain developer credentials" : "portable professional credentials"} globally
4. Achieve $1M in platform fee revenue within 18 months

Secondary objectives:
• Establish ${projectTitle} as the default trust layer for ${c.isWeb3 ? "Web3" : "distributed"} project execution
• Build proprietary market rate data asset (talent + project pricing)
• Create defensible moat via credential network effects


4. FUNCTIONAL REQUIREMENTS
${LINE}
MUST HAVE (P0 — launch blockers):

Authentication & Users
□ Email/password registration + JWT authentication
□ Role selection: business | talent
□ ${c.isWeb3 ? "Wallet connection (MetaMask, WalletConnect)" : "OAuth login (Google, GitHub)"}
□ User profile with avatar, bio, skills

Room Management
□ Business can create a "Live Room" with project description
□ AI generates structured project brief from description
□ Room has unique code for sharing
□ Room status lifecycle: scoping → matching → open → assembling → contracted → closed

Talent System
□ Talent applies to rooms by role
□ Business invites specific talent
□ ${c.isWeb3 ? "SBT credential verification on-chain" : "Credential upload + verification workflow"}
□ Reputation score calculated from credentials

Collaboration
□ Real-time chat per room
□ AI chat assistant for research + Q&A
□ Ticket/kanban board (backlog → done)
□ Milestone tracker with escrow amounts

Legal / Contracts
□ AI-generated NDA and SOW
□ Digital signature flow (both parties)
□ Room moves to "contracted" status after full signing

SHOULD HAVE (P1 — first 30 days post-launch):

□ Google Meet link integration per room
□ File attachments in chat
□ Milestone dispute flow
□ Email notifications (invites, signatures, milestone releases)
□ ${c.isWeb3 ? "Credential issuance ceremony (on-chain, triggered on project completion)" : "Certificate generation on project completion"}

NICE TO HAVE (P2 — roadmap):
□ Mobile app (iOS + Android)
□ AI-generated market rate reports
□ DAO governance for platform decisions
□ Multi-currency escrow (ETH, USDC, stablecoins)


5. TECHNICAL REQUIREMENTS
${LINE}
Performance:
• Page load < 2 seconds (P90)
• API response < 500ms (P95)
• Real-time event latency < 100ms
• Support 500 concurrent WebSocket connections at launch

Availability:
• 99.5% uptime SLA (< 4 hours downtime/month)
• Graceful degradation (chat works if AI is down)
• Zero-downtime deployments

Browser support:
• Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
• Mobile-responsive (no native app required at launch)

Security:
• HTTPS everywhere, HSTS enabled
• CSRF protection on all mutations
• SQL/NoSQL injection prevention via ORM + validation
• ${c.isWeb3 ? "Smart contract audit before mainnet" : "OWASP Top 10 compliance"}
• GDPR: right to erasure, data portability

Compliance:
• ${c.isWeb3 ? "Token sale regulations do not apply (utility token, not security)" : "SOC2 Type I target within 12 months"}
• Data residency: US + EU options


6. OUT OF SCOPE
${LINE}
The following are explicitly not included in the initial build:

✗ Native mobile applications
✗ ${c.isWeb3 ? "Token issuance or fundraising mechanisms" : "Payment processing (fiat) — escrow only in first version"}
✗ Multi-language support (English only at launch)
✗ Custom white-label deployments
✗ Video recording / playback
✗ Advanced analytics dashboard (basic metrics only)
✗ Third-party ATS integration


7. SUCCESS CRITERIA
${LINE}
The project is considered successful when:

Technical:
✓ All P0 functional requirements working end-to-end
✓ Performance benchmarks met (< 2s load, < 500ms API)
✓ 0 critical or high-severity security vulnerabilities
✓ 80%+ test coverage on business logic
✓ Successfully deployed to production

Business:
✓ 10 design partners have created at least 1 room each
✓ At least 50 talent profiles with verified credentials
✓ At least 3 rooms have reached "contracted" status
✓ NPS score > 40 from pilot users
✓ Total milestone value processed > $50,000


8. RISK REGISTER
${LINE}
RISK 1: Smart contract vulnerability (if applicable)
  Probability: Medium | Impact: Critical
  Mitigation: Mandatory audit before mainnet; emergency pause function; bug bounty

RISK 2: AI feature quality without OpenAI key
  Probability: High (during demo) | Impact: Medium
  Mitigation: Mock fallbacks for all AI features; graceful "demo mode" labeling

RISK 3: Firebase chat dependency
  Probability: Low | Impact: Medium
  Mitigation: Local state fallback implemented; chat is non-blocking for core workflow

RISK 4: Talent supply-side cold start
  Probability: High | Impact: High
  Mitigation: Seed with 50 high-reputation profiles before public launch; incentivize with free credential issuance

RISK 5: Regulatory uncertainty (${c.isWeb3 ? "token classification, KYC requirements" : "contractor classification laws"})
  Probability: Medium | Impact: Medium
  Mitigation: Legal review in target markets; platform positioned as "coordination tool, not employer"


9. STAKEHOLDERS
${LINE}
Internal:
• Product Owner: [Name] — final decision on scope and priorities
• Tech Lead: [Name] — architecture and technical decisions
• Design Lead: [Name] — UX and visual design

External:
• Pilot Customers (10 businesses): product feedback and validation
• DEHIX AI Advisor: platform strategy and AI feature roadmap

Communication:
• Weekly sync (30 min) — all stakeholders
• Bi-weekly demo — Client + pilot customers review progress
• Async updates in Live Room (eating our own dog food)

${DIVIDER}
Generated by DEHIX Live Room · Document Mode · ${c.date}
Based on ${messages.length} research conversation messages
${DIVIDER}`;
}
