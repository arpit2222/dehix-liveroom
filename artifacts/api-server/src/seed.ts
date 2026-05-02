import { connectMongoDB } from "./lib/mongodb.js";
import { User } from "./models/User.js";
import { SbtCredential } from "./models/SbtCredential.js";
import { LiveRoom } from "./models/LiveRoom.js";
import { RoomRole } from "./models/RoomRole.js";
import bcrypt from "bcryptjs";

const SKILL_DOMAINS = [
  "Solidity / Smart Contracts",
  "React / Frontend",
  "Node.js / Backend",
  "ZK Proofs / Cryptography",
  "DeFi Protocol Design",
];

async function seed() {
  await connectMongoDB();
  console.log("Connected to MongoDB, starting seed...");

  await Promise.all([
    User.deleteMany({}),
    SbtCredential.deleteMany({}),
    LiveRoom.deleteMany({}),
    RoomRole.deleteMany({}),
  ]);

  const hashedPwd = await bcrypt.hash("demo123", 10);

  const business = await User.create({
    email: "business@demo.com",
    password: hashedPwd,
    name: "Nexus Protocol",
    role: "business",
    walletAddress: "0xNexus1234567890abcdef",
    isOnline: true,
  });

  const talents = await User.insertMany([
    {
      email: "alex@demo.com",
      password: hashedPwd,
      name: "Alex Chen",
      role: "talent",
      walletAddress: "0xAlex1234567890abcdef",
      isOnline: true,
    },
    {
      email: "priya@demo.com",
      password: hashedPwd,
      name: "Priya Sharma",
      role: "talent",
      walletAddress: "0xPriya1234567890abcdef",
      isOnline: true,
    },
    {
      email: "marco@demo.com",
      password: hashedPwd,
      name: "Marco Rossi",
      role: "talent",
      walletAddress: "0xMarco1234567890abcdef",
      isOnline: false,
    },
    {
      email: "yuki@demo.com",
      password: hashedPwd,
      name: "Yuki Tanaka",
      role: "talent",
      walletAddress: "0xYuki1234567890abcdef",
      isOnline: true,
    },
    {
      email: "sara@demo.com",
      password: hashedPwd,
      name: "Sara Kim",
      role: "talent",
      walletAddress: "0xSara1234567890abcdef",
      isOnline: false,
    },
  ]);

  const credentialSeeds = [
    { userId: talents[0]!._id, skillDomain: SKILL_DOMAINS[0]!, level: 2, reputationScore: 920, githubScore: 95, interviewScore: 88, projectsCompleted: 12 },
    { userId: talents[0]!._id, skillDomain: SKILL_DOMAINS[4]!, level: 1, reputationScore: 780, githubScore: 80, interviewScore: 75, projectsCompleted: 5 },
    { userId: talents[1]!._id, skillDomain: SKILL_DOMAINS[1]!, level: 2, reputationScore: 875, githubScore: 90, interviewScore: 85, projectsCompleted: 18 },
    { userId: talents[1]!._id, skillDomain: SKILL_DOMAINS[2]!, level: 1, reputationScore: 720, githubScore: 72, interviewScore: 70, projectsCompleted: 8 },
    { userId: talents[2]!._id, skillDomain: SKILL_DOMAINS[3]!, level: 2, reputationScore: 960, githubScore: 98, interviewScore: 92, projectsCompleted: 7 },
    { userId: talents[3]!._id, skillDomain: SKILL_DOMAINS[0]!, level: 1, reputationScore: 650, githubScore: 65, interviewScore: 62, projectsCompleted: 4 },
    { userId: talents[3]!._id, skillDomain: SKILL_DOMAINS[2]!, level: 2, reputationScore: 810, githubScore: 82, interviewScore: 79, projectsCompleted: 9 },
    { userId: talents[4]!._id, skillDomain: SKILL_DOMAINS[1]!, level: 1, reputationScore: 700, githubScore: 70, interviewScore: 68, projectsCompleted: 6 },
  ];

  for (const cred of credentialSeeds) {
    await SbtCredential.create({
      ...cred,
      status: "verified",
      embeddingText: `${cred.skillDomain} level ${cred.level} developer with ${cred.projectsCompleted} completed projects`,
      issuedAt: new Date(),
    });
  }

  const demoRoom = await LiveRoom.create({
    roomCode: "NEXUS001",
    businessId: business._id,
    title: "Cross-chain DeFi Aggregator Protocol",
    rawDescription: "Build a cross-chain DeFi yield aggregator that automatically rebalances positions across Ethereum, Arbitrum, and Optimism. Needs smart contract security, React dashboard, and ZK-proof privacy layer.",
    aiScopedBrief: {
      projectTitle: "Cross-chain DeFi Aggregator Protocol",
      projectSummary: "A yield-optimizing DeFi protocol spanning three EVM chains with an automated rebalancing engine and a privacy layer using ZK proofs. The interface will be a React dashboard with real-time metrics.",
      estimatedWeeks: 12,
      complexity: "very_high",
      roles: [
        { roleTitle: "Lead Solidity Engineer", skillDomain: "Solidity / Smart Contracts", requiredLevel: 2, minReputation: 800, estimatedHours: 320 },
        { roleTitle: "ZK Cryptographer", skillDomain: "ZK Proofs / Cryptography", requiredLevel: 2, minReputation: 900, estimatedHours: 240 },
        { roleTitle: "React Frontend Dev", skillDomain: "React / Frontend", requiredLevel: 1, minReputation: 600, estimatedHours: 200 },
      ],
      technicalRisks: ["Cross-chain bridge security vulnerabilities", "ZK circuit complexity may exceed gas limits", "MEV sandwich attacks on rebalancing transactions"],
      suggestedTotalBudgetUsd: 85000,
    },
    status: "open",
    meetLink: "https://meet.google.com/new",
  });

  await RoomRole.insertMany([
    { roomId: demoRoom._id, roleTitle: "Lead Solidity Engineer", skillDomain: "Solidity / Smart Contracts", requiredLevel: 2, minReputation: 800, status: "open" },
    { roomId: demoRoom._id, roleTitle: "ZK Cryptographer", skillDomain: "ZK Proofs / Cryptography", requiredLevel: 2, minReputation: 900, status: "open" },
    { roomId: demoRoom._id, roleTitle: "React Frontend Dev", skillDomain: "React / Frontend", requiredLevel: 1, minReputation: 600, status: "open" },
  ]);

  console.log("Seed complete:");
  console.log("  business@demo.com / demo123  (Nexus Protocol)");
  console.log("  alex@demo.com / demo123  (Solidity + DeFi)");
  console.log("  priya@demo.com / demo123  (React + Node.js)");
  console.log("  marco@demo.com / demo123  (ZK Proofs)");
  console.log("  yuki@demo.com / demo123  (Solidity + Node.js)");
  console.log("  sara@demo.com / demo123  (React)");
  console.log("  Demo room: NEXUS001 (open)");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
