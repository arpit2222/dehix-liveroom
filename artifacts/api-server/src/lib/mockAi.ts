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
  if (m.includes("budget") || m.includes("cost") || m.includes("price")) {
    return `For "${projectTitle}", a realistic Web3 build budget typically runs $50k–$120k depending on chain complexity and audit requirements. The milestone escrow breakdown in this room reflects a fair market rate for verified talent.`;
  }
  if (m.includes("timeline") || m.includes("how long") || m.includes("weeks")) {
    return `A project like "${projectTitle}" realistically takes 8–14 weeks end-to-end: 2 weeks design, 4–6 weeks build, 1–2 weeks audit, 1 week deployment. Rushing the audit phase is the #1 risk teams take that leads to exploits.`;
  }
  if (m.includes("risk") || m.includes("security") || m.includes("audit")) {
    return `Top risks for Web3 projects: (1) Reentrancy attacks — use checks-effects-interactions, (2) Oracle manipulation — use decentralized oracles like Chainlink, (3) Upgrade key compromise — use a multisig timelocked proxy, (4) Front-running — consider commit-reveal patterns. Budget at least $15k for a reputable audit.`;
  }
  if (m.includes("ticket") || m.includes("task") || m.includes("break")) {
    return `To break this project into tickets: start with contract interfaces first (1 ticket per function group), then API endpoints that mirror contract events, then frontend components. Each ticket should be completable in 4–16 hours. Anything larger should be split.`;
  }
  if (m.includes("nda") || m.includes("contract") || m.includes("legal")) {
    return `For Web3 projects I recommend: mutual NDA covering code and business logic (2 years), IP assignment on full payment, milestone-based escrow with 5% holdback until 30 days post-launch, and DEHIX oracle arbitration for disputes. Generate the NDA from the NDA tab.`;
  }
  if (m.includes("team") || m.includes("hire") || m.includes("talent")) {
    return `For "${projectTitle}" you need at minimum: 1 senior Solidity engineer (the most critical hire — bad contracts cost millions), 1 full-stack dev for the dashboard, and 1 backend dev for the API/indexer. Use reputation scores above 700 as your filter threshold.`;
  }
  return `Good question about "${projectTitle}". In demo mode, I'm using scripted responses — connect an OpenAI key in Replit Secrets to get real AI answers tailored to your project context. For now: what specifically do you need help with — budget, timeline, team structure, or technical risks?`;
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
