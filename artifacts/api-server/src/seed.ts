import { connectMongoDB } from "./lib/mongodb.js";
import { User } from "./models/User.js";
import { SbtCredential } from "./models/SbtCredential.js";
import { LiveRoom } from "./models/LiveRoom.js";
import { RoomRole } from "./models/RoomRole.js";
import { RoomParticipant } from "./models/RoomParticipant.js";
import { FreelancerMatch } from "./models/FreelancerMatch.js";
import { ProjectShortlist } from "./models/ProjectShortlist.js";
import { ProjectEnquiry } from "./models/ProjectEnquiry.js";
import { ProjectEnquiryRecipient } from "./models/ProjectEnquiryRecipient.js";
import { HireOffer } from "./models/HireOffer.js";
import { Notification } from "./models/Notification.js";
import { RoomChannel } from "./models/RoomChannel.js";
import { RoomMessage } from "./models/RoomMessage.js";
import { RoomDocumentPermission } from "./models/RoomDocumentPermission.js";
import bcrypt from "bcryptjs";

type TalentSeed = {
  email: string;
  name: string;
  walletAddress: string;
  isOnline: boolean;
  availability: "available" | "available_soon" | "part_time" | "busy" | "unavailable" | "unknown";
  hourlyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  rating: number;
  completedProjects: number;
  location: string;
  skills: Array<{
    skillDomain: string;
    level: 1 | 2;
    reputationScore: number;
    githubScore: number;
    interviewScore: number;
    projectsCompleted: number;
    keywords: string[];
  }>;
};

const talentSeeds: TalentSeed[] = [
  {
    email: "alex@demo.com",
    name: "Alex Chen",
    walletAddress: "0xTalent0001Alex",
    isOnline: true,
    availability: "available",
    hourlyRate: 78,
    weeklyRate: 2800,
    monthlyRate: 10400,
    rating: 4.8,
    completedProjects: 18,
    location: "Singapore",
    skills: [
      { skillDomain: "Solidity / Smart Contracts / DeFi", level: 2, reputationScore: 930, githubScore: 95, interviewScore: 90, projectsCompleted: 18, keywords: ["solidity", "smart contracts", "defi", "evm", "hardhat"] },
      { skillDomain: "Security / Auditing", level: 1, reputationScore: 760, githubScore: 82, interviewScore: 78, projectsCompleted: 8, keywords: ["audit", "slither", "foundry", "security"] },
    ],
  },
  {
    email: "priya@demo.com",
    name: "Priya Sharma",
    walletAddress: "0xTalent0002Priya",
    isOnline: true,
    availability: "available",
    hourlyRate: 52,
    weeklyRate: 1900,
    monthlyRate: 7200,
    rating: 4.7,
    completedProjects: 22,
    location: "India",
    skills: [
      { skillDomain: "React / Frontend / TypeScript / Tailwind", level: 2, reputationScore: 890, githubScore: 91, interviewScore: 86, projectsCompleted: 22, keywords: ["react", "next.js", "typescript", "tailwind", "dashboard"] },
      { skillDomain: "Node.js / Backend", level: 1, reputationScore: 720, githubScore: 75, interviewScore: 72, projectsCompleted: 9, keywords: ["node", "express", "api", "mongodb"] },
    ],
  },
  {
    email: "marco@demo.com",
    name: "Marco Rossi",
    walletAddress: "0xTalent0003Marco",
    isOnline: false,
    availability: "busy",
    hourlyRate: 92,
    weeklyRate: 3300,
    monthlyRate: 12800,
    rating: 4.9,
    completedProjects: 11,
    location: "Italy",
    skills: [
      { skillDomain: "ZK Proofs / Cryptography / Circuits", level: 2, reputationScore: 965, githubScore: 98, interviewScore: 93, projectsCompleted: 11, keywords: ["zk", "zero knowledge", "circom", "snark", "cryptography"] },
      { skillDomain: "Rust / Systems", level: 1, reputationScore: 790, githubScore: 84, interviewScore: 80, projectsCompleted: 7, keywords: ["rust", "systems", "wasm"] },
    ],
  },
  {
    email: "yuki@demo.com",
    name: "Yuki Tanaka",
    walletAddress: "0xTalent0004Yuki",
    isOnline: true,
    availability: "part_time",
    hourlyRate: 64,
    weeklyRate: 1800,
    monthlyRate: 7600,
    rating: 4.5,
    completedProjects: 13,
    location: "Japan",
    skills: [
      { skillDomain: "Node.js / Backend / MongoDB / APIs", level: 2, reputationScore: 835, githubScore: 84, interviewScore: 82, projectsCompleted: 13, keywords: ["node", "express", "mongodb", "rest api", "socket.io"] },
      { skillDomain: "Solidity / Smart Contracts", level: 1, reputationScore: 690, githubScore: 68, interviewScore: 70, projectsCompleted: 5, keywords: ["solidity", "ethers", "web3"] },
    ],
  },
  {
    email: "sara@demo.com",
    name: "Sara Kim",
    walletAddress: "0xTalent0005Sara",
    isOnline: false,
    availability: "available_soon",
    hourlyRate: 46,
    weeklyRate: 1600,
    monthlyRate: 6400,
    rating: 4.3,
    completedProjects: 10,
    location: "South Korea",
    skills: [
      { skillDomain: "React / Frontend / Design Systems", level: 1, reputationScore: 720, githubScore: 72, interviewScore: 76, projectsCompleted: 10, keywords: ["react", "component library", "tailwind", "storybook"] },
    ],
  },
  {
    email: "aanya@demo.com",
    name: "Aanya Rao",
    walletAddress: "0xTalent0006Aanya",
    isOnline: true,
    availability: "available",
    hourlyRate: 44,
    weeklyRate: 1500,
    monthlyRate: 6000,
    rating: 4.8,
    completedProjects: 19,
    location: "India",
    skills: [
      { skillDomain: "UI/UX Design / Figma / Product Design", level: 2, reputationScore: 910, githubScore: 55, interviewScore: 91, projectsCompleted: 19, keywords: ["ui", "ux", "figma", "wireframes", "prototype", "design system"] },
      { skillDomain: "Tailwind / Frontend Handoff", level: 1, reputationScore: 760, githubScore: 70, interviewScore: 82, projectsCompleted: 8, keywords: ["tailwind", "responsive", "handoff", "design tokens"] },
    ],
  },
  {
    email: "rohan.design@demo.com",
    name: "Rohan Mehta",
    walletAddress: "0xTalent0007Rohan",
    isOnline: true,
    availability: "part_time",
    hourlyRate: 38,
    weeklyRate: 1100,
    monthlyRate: 5200,
    rating: 4.4,
    completedProjects: 14,
    location: "India",
    skills: [
      { skillDomain: "UI/UX Design / Mobile UX / Figma", level: 1, reputationScore: 780, githubScore: 42, interviewScore: 84, projectsCompleted: 14, keywords: ["ui ux designer", "figma", "mobile app", "user flows", "prototype"] },
    ],
  },
  {
    email: "meera@demo.com",
    name: "Meera Iyer",
    walletAddress: "0xTalent0008Meera",
    isOnline: false,
    availability: "busy",
    hourlyRate: 56,
    weeklyRate: 2100,
    monthlyRate: 8300,
    rating: 4.9,
    completedProjects: 24,
    location: "India",
    skills: [
      { skillDomain: "Product Design / UX Research / Figma", level: 2, reputationScore: 940, githubScore: 50, interviewScore: 95, projectsCompleted: 24, keywords: ["ux research", "figma", "journey map", "design system", "saas ui"] },
    ],
  },
  {
    email: "kabir.ui@demo.com",
    name: "Kabir Sethi",
    walletAddress: "0xTalent0009Kabir",
    isOnline: true,
    availability: "available",
    hourlyRate: 42,
    weeklyRate: 1450,
    monthlyRate: 5800,
    rating: 4.6,
    completedProjects: 16,
    location: "India",
    skills: [
      { skillDomain: "UI Engineering / Tailwind / Figma", level: 2, reputationScore: 850, githubScore: 78, interviewScore: 87, projectsCompleted: 16, keywords: ["ui", "tailwind", "figma", "react", "responsive"] },
    ],
  },
  {
    email: "neel.frontend@demo.com",
    name: "Neel Kapoor",
    walletAddress: "0xTalent0010Neel",
    isOnline: true,
    availability: "available",
    hourlyRate: 48,
    weeklyRate: 1700,
    monthlyRate: 6800,
    rating: 4.5,
    completedProjects: 15,
    location: "India",
    skills: [
      { skillDomain: "Next.js / React / TypeScript / Tailwind", level: 2, reputationScore: 835, githubScore: 88, interviewScore: 83, projectsCompleted: 15, keywords: ["next.js", "react", "typescript", "tailwind", "frontend"] },
    ],
  },
  {
    email: "tara.react@demo.com",
    name: "Tara Singh",
    walletAddress: "0xTalent0011Tara",
    isOnline: false,
    availability: "available_soon",
    hourlyRate: 36,
    weeklyRate: 1250,
    monthlyRate: 5000,
    rating: 4.2,
    completedProjects: 8,
    location: "India",
    skills: [
      { skillDomain: "React / Frontend / Web Apps", level: 1, reputationScore: 695, githubScore: 72, interviewScore: 74, projectsCompleted: 8, keywords: ["react", "vite", "frontend", "forms", "tailwind"] },
    ],
  },
  {
    email: "ishan.web@demo.com",
    name: "Ishan Verma",
    walletAddress: "0xTalent0012Ishan",
    isOnline: true,
    availability: "available",
    hourlyRate: 58,
    weeklyRate: 2200,
    monthlyRate: 8600,
    rating: 4.7,
    completedProjects: 20,
    location: "India",
    skills: [
      { skillDomain: "Frontend Architecture / React / Design Systems", level: 2, reputationScore: 900, githubScore: 92, interviewScore: 88, projectsCompleted: 20, keywords: ["react", "frontend architecture", "design system", "typescript", "storybook"] },
    ],
  },
  {
    email: "arjun.backend@demo.com",
    name: "Arjun Nair",
    walletAddress: "0xTalent0013Arjun",
    isOnline: true,
    availability: "available",
    hourlyRate: 55,
    weeklyRate: 2000,
    monthlyRate: 7900,
    rating: 4.6,
    completedProjects: 17,
    location: "India",
    skills: [
      { skillDomain: "Node.js / Express / MongoDB / REST API", level: 2, reputationScore: 870, githubScore: 86, interviewScore: 85, projectsCompleted: 17, keywords: ["node.js", "express", "mongodb", "rest api", "jwt"] },
    ],
  },
  {
    email: "dev.api@demo.com",
    name: "Dev Malhotra",
    walletAddress: "0xTalent0014Dev",
    isOnline: false,
    availability: "busy",
    hourlyRate: 47,
    weeklyRate: 1700,
    monthlyRate: 6900,
    rating: 4.1,
    completedProjects: 9,
    location: "India",
    skills: [
      { skillDomain: "Backend / Node.js / PostgreSQL / APIs", level: 1, reputationScore: 710, githubScore: 76, interviewScore: 73, projectsCompleted: 9, keywords: ["backend", "node", "postgres", "api", "auth"] },
    ],
  },
  {
    email: "leela.backend@demo.com",
    name: "Leela Menon",
    walletAddress: "0xTalent0015Leela",
    isOnline: true,
    availability: "part_time",
    hourlyRate: 62,
    weeklyRate: 1850,
    monthlyRate: 7400,
    rating: 4.5,
    completedProjects: 12,
    location: "India",
    skills: [
      { skillDomain: "Backend / Realtime / Socket.IO / MongoDB", level: 2, reputationScore: 820, githubScore: 80, interviewScore: 82, projectsCompleted: 12, keywords: ["socket.io", "node", "mongodb", "realtime", "queues"] },
    ],
  },
  {
    email: "nikhil.sol@demo.com",
    name: "Nikhil Bansal",
    walletAddress: "0xTalent0016Nikhil",
    isOnline: true,
    availability: "available",
    hourlyRate: 72,
    weeklyRate: 2600,
    monthlyRate: 9800,
    rating: 4.6,
    completedProjects: 12,
    location: "India",
    skills: [
      { skillDomain: "Solidity / EVM / Foundry / Hardhat", level: 2, reputationScore: 880, githubScore: 90, interviewScore: 84, projectsCompleted: 12, keywords: ["solidity", "evm", "foundry", "hardhat", "openzeppelin"] },
    ],
  },
  {
    email: "omar.defi@demo.com",
    name: "Omar Khan",
    walletAddress: "0xTalent0017Omar",
    isOnline: false,
    availability: "available_soon",
    hourlyRate: 83,
    weeklyRate: 3000,
    monthlyRate: 11500,
    rating: 4.7,
    completedProjects: 15,
    location: "UAE",
    skills: [
      { skillDomain: "DeFi Protocol Design / Solidity", level: 2, reputationScore: 905, githubScore: 88, interviewScore: 89, projectsCompleted: 15, keywords: ["defi", "tokenomics", "solidity", "staking", "liquidity"] },
    ],
  },
  {
    email: "zoya.contracts@demo.com",
    name: "Zoya Patel",
    walletAddress: "0xTalent0018Zoya",
    isOnline: true,
    availability: "part_time",
    hourlyRate: 59,
    weeklyRate: 1750,
    monthlyRate: 7200,
    rating: 4.3,
    completedProjects: 7,
    location: "India",
    skills: [
      { skillDomain: "Smart Contracts / Solidity / Testing", level: 1, reputationScore: 735, githubScore: 78, interviewScore: 76, projectsCompleted: 7, keywords: ["solidity", "smart contracts", "tests", "ethers"] },
    ],
  },
  {
    email: "elena.zk@demo.com",
    name: "Elena Novak",
    walletAddress: "0xTalent0019Elena",
    isOnline: true,
    availability: "available",
    hourlyRate: 88,
    weeklyRate: 3200,
    monthlyRate: 12400,
    rating: 4.8,
    completedProjects: 9,
    location: "Germany",
    skills: [
      { skillDomain: "ZK Proofs / Circom / Noir", level: 2, reputationScore: 925, githubScore: 93, interviewScore: 91, projectsCompleted: 9, keywords: ["zk", "circom", "noir", "snark", "privacy"] },
    ],
  },
  {
    email: "vikram.security@demo.com",
    name: "Vikram Joshi",
    walletAddress: "0xTalent0020Vikram",
    isOnline: false,
    availability: "busy",
    hourlyRate: 96,
    weeklyRate: 3600,
    monthlyRate: 13800,
    rating: 4.9,
    completedProjects: 21,
    location: "India",
    skills: [
      { skillDomain: "Security / Smart Contract Auditing", level: 2, reputationScore: 955, githubScore: 91, interviewScore: 94, projectsCompleted: 21, keywords: ["security", "audit", "slither", "mythril", "foundry"] },
    ],
  },
  {
    email: "hana.rust@demo.com",
    name: "Hana Park",
    walletAddress: "0xTalent0021Hana",
    isOnline: true,
    availability: "available",
    hourlyRate: 74,
    weeklyRate: 2700,
    monthlyRate: 10100,
    rating: 4.6,
    completedProjects: 10,
    location: "South Korea",
    skills: [
      { skillDomain: "Rust / Systems / WASM", level: 2, reputationScore: 860, githubScore: 89, interviewScore: 84, projectsCompleted: 10, keywords: ["rust", "wasm", "systems", "performance"] },
    ],
  },
  {
    email: "maya.ai@demo.com",
    name: "Maya Kapoor",
    walletAddress: "0xTalent0022Maya",
    isOnline: true,
    availability: "available",
    hourlyRate: 68,
    weeklyRate: 2500,
    monthlyRate: 9600,
    rating: 4.7,
    completedProjects: 13,
    location: "India",
    skills: [
      { skillDomain: "AI / Machine Learning / LLM Apps", level: 2, reputationScore: 875, githubScore: 87, interviewScore: 88, projectsCompleted: 13, keywords: ["ai", "llm", "openai", "rag", "machine learning"] },
    ],
  },
  {
    email: "karan.ml@demo.com",
    name: "Karan Shah",
    walletAddress: "0xTalent0023Karan",
    isOnline: false,
    availability: "available_soon",
    hourlyRate: 54,
    weeklyRate: 1950,
    monthlyRate: 7800,
    rating: 4.2,
    completedProjects: 8,
    location: "India",
    skills: [
      { skillDomain: "ML Engineering / Python / Data Pipelines", level: 1, reputationScore: 715, githubScore: 79, interviewScore: 74, projectsCompleted: 8, keywords: ["python", "ml", "data pipeline", "analytics"] },
    ],
  },
  {
    email: "noor.ai@demo.com",
    name: "Noor Ali",
    walletAddress: "0xTalent0024Noor",
    isOnline: true,
    availability: "part_time",
    hourlyRate: 60,
    weeklyRate: 1800,
    monthlyRate: 7200,
    rating: 4.4,
    completedProjects: 9,
    location: "Pakistan",
    skills: [
      { skillDomain: "AI Product Engineer / Chatbots / RAG", level: 2, reputationScore: 790, githubScore: 81, interviewScore: 82, projectsCompleted: 9, keywords: ["chatbot", "rag", "openai", "vector search", "node"] },
    ],
  },
  {
    email: "sameer.devops@demo.com",
    name: "Sameer Kulkarni",
    walletAddress: "0xTalent0025Sameer",
    isOnline: true,
    availability: "available",
    hourlyRate: 57,
    weeklyRate: 2050,
    monthlyRate: 8200,
    rating: 4.5,
    completedProjects: 16,
    location: "India",
    skills: [
      { skillDomain: "DevOps / AWS / Docker / CI/CD", level: 2, reputationScore: 840, githubScore: 83, interviewScore: 81, projectsCompleted: 16, keywords: ["aws", "docker", "ci cd", "deployment", "monitoring"] },
    ],
  },
  {
    email: "ritu.cloud@demo.com",
    name: "Ritu Bose",
    walletAddress: "0xTalent0026Ritu",
    isOnline: false,
    availability: "busy",
    hourlyRate: 63,
    weeklyRate: 2300,
    monthlyRate: 9000,
    rating: 4.4,
    completedProjects: 14,
    location: "India",
    skills: [
      { skillDomain: "Cloud Infrastructure / Kubernetes / AWS", level: 2, reputationScore: 815, githubScore: 80, interviewScore: 80, projectsCompleted: 14, keywords: ["kubernetes", "aws", "terraform", "infra", "devops"] },
    ],
  },
  {
    email: "diya.pm@demo.com",
    name: "Diya Fernandes",
    walletAddress: "0xTalent0027Diya",
    isOnline: true,
    availability: "available",
    hourlyRate: 48,
    weeklyRate: 1750,
    monthlyRate: 7000,
    rating: 4.6,
    completedProjects: 18,
    location: "India",
    skills: [
      { skillDomain: "Product Management / Agile / Web3 Delivery", level: 2, reputationScore: 825, githubScore: 45, interviewScore: 88, projectsCompleted: 18, keywords: ["product manager", "agile", "roadmap", "sprint", "requirements"] },
    ],
  },
  {
    email: "arav.qa@demo.com",
    name: "Arav Gupta",
    walletAddress: "0xTalent0028Arav",
    isOnline: true,
    availability: "available",
    hourlyRate: 34,
    weeklyRate: 1200,
    monthlyRate: 4700,
    rating: 4.3,
    completedProjects: 12,
    location: "India",
    skills: [
      { skillDomain: "QA Automation / Playwright / Testing", level: 1, reputationScore: 705, githubScore: 74, interviewScore: 76, projectsCompleted: 12, keywords: ["qa", "playwright", "testing", "automation", "regression"] },
    ],
  },
  {
    email: "lina.mobile@demo.com",
    name: "Lina Gomez",
    walletAddress: "0xTalent0029Lina",
    isOnline: false,
    availability: "available_soon",
    hourlyRate: 50,
    weeklyRate: 1800,
    monthlyRate: 7100,
    rating: 4.4,
    completedProjects: 11,
    location: "Mexico",
    skills: [
      { skillDomain: "Mobile Development / React Native", level: 2, reputationScore: 800, githubScore: 82, interviewScore: 79, projectsCompleted: 11, keywords: ["mobile", "react native", "ios", "android"] },
    ],
  },
  {
    email: "ben.fullstack@demo.com",
    name: "Ben Carter",
    walletAddress: "0xTalent0030Ben",
    isOnline: true,
    availability: "available",
    hourlyRate: 65,
    weeklyRate: 2350,
    monthlyRate: 9200,
    rating: 4.5,
    completedProjects: 17,
    location: "United States",
    skills: [
      { skillDomain: "Full Stack / React / Node.js / MongoDB", level: 2, reputationScore: 845, githubScore: 86, interviewScore: 84, projectsCompleted: 17, keywords: ["full stack", "react", "node", "mongodb", "typescript"] },
    ],
  },
];

async function seed() {
  await connectMongoDB();
  console.log("Connected to MongoDB, starting seed...");

  await Promise.all([
    User.deleteMany({}),
    SbtCredential.deleteMany({}),
    LiveRoom.deleteMany({}),
    RoomRole.deleteMany({}),
    RoomParticipant.deleteMany({}),
    FreelancerMatch.deleteMany({}),
    ProjectShortlist.deleteMany({}),
    ProjectEnquiry.deleteMany({}),
    ProjectEnquiryRecipient.deleteMany({}),
    HireOffer.deleteMany({}),
    Notification.deleteMany({}),
    RoomChannel.deleteMany({}),
    RoomMessage.deleteMany({}),
    RoomDocumentPermission.deleteMany({}),
  ]);

  const hashedPwd = await bcrypt.hash("demo123", 10);

  const business = await User.create({
    email: "business@demo.com",
    password: hashedPwd,
    name: "Nexus Protocol",
    role: "business",
    walletAddress: "0xNexus1234567890abcdef",
    isOnline: true,
    accountStatus: "active",
    profileCompleted: true,
    emailVerified: true,
  });

  const talents = await User.insertMany(
    talentSeeds.map((talent) => ({
      email: talent.email,
      password: hashedPwd,
      name: talent.name,
      role: "talent" as const,
      walletAddress: talent.walletAddress,
      isOnline: talent.isOnline,
      availability: talent.availability,
      hourlyRate: talent.hourlyRate,
      weeklyRate: talent.weeklyRate,
      monthlyRate: talent.monthlyRate,
      rating: talent.rating,
      completedProjects: talent.completedProjects,
      location: talent.location,
      remote: true,
      emailVerified: true,
      profileCompleted: true,
      accountStatus: "active",
      notificationPreferences: {
        projectEnquiryEmail: true,
        inAppNotifications: true,
      },
    }))
  );

  const talentByEmail = new Map(talents.map((talent) => [talent.email, talent]));
  for (const seedTalent of talentSeeds) {
    const user = talentByEmail.get(seedTalent.email);
    if (!user) continue;
    for (const skill of seedTalent.skills) {
      await SbtCredential.create({
        userId: user._id,
        skillDomain: skill.skillDomain,
        level: skill.level,
        reputationScore: skill.reputationScore,
        githubScore: skill.githubScore,
        interviewScore: skill.interviewScore,
        projectsCompleted: skill.projectsCompleted,
        status: "verified",
        embeddingText: `${skill.skillDomain} ${skill.keywords.join(" ")} level ${skill.level} freelancer with ${skill.projectsCompleted} completed projects`,
        issuedAt: new Date(),
      });
    }
  }

  const demoRoom = await LiveRoom.create({
    roomCode: "NEXUS001",
    businessId: business._id,
    title: "Cross-chain DeFi Aggregator Protocol",
    rawDescription:
      "Build a cross-chain DeFi yield aggregator with a React dashboard, Figma-led UI, Node APIs, Solidity contracts, ZK privacy, and DevOps deployment.",
    aiScopedBrief: {
      projectTitle: "Cross-chain DeFi Aggregator Protocol",
      projectSummary:
        "A yield-optimizing DeFi protocol spanning EVM chains with an automated rebalancing engine and a privacy layer using ZK proofs. The interface will be a polished React dashboard based on Figma designs.",
      estimatedWeeks: 12,
      complexity: "very_high",
      roles: [
        { roleTitle: "UI/UX Designer", skillDomain: "UI/UX Design / Figma / Tailwind", requiredLevel: 1, minReputation: 650, estimatedHours: 120 },
        { roleTitle: "React Frontend Engineer", skillDomain: "React / Frontend / TypeScript / Tailwind", requiredLevel: 1, minReputation: 650, estimatedHours: 220 },
        { roleTitle: "Node Backend Engineer", skillDomain: "Node.js / Backend / MongoDB / APIs", requiredLevel: 1, minReputation: 650, estimatedHours: 220 },
        { roleTitle: "Lead Solidity Engineer", skillDomain: "Solidity / Smart Contracts / DeFi", requiredLevel: 2, minReputation: 800, estimatedHours: 320 },
        { roleTitle: "ZK Cryptographer", skillDomain: "ZK Proofs / Cryptography / Circuits", requiredLevel: 2, minReputation: 850, estimatedHours: 240 },
        { roleTitle: "DevOps Engineer", skillDomain: "DevOps / AWS / Docker / CI/CD", requiredLevel: 1, minReputation: 650, estimatedHours: 120 },
      ],
      technicalRisks: ["Cross-chain bridge security vulnerabilities", "ZK circuit complexity may exceed gas limits", "MEV attacks on rebalancing transactions"],
      suggestedTotalBudgetUsd: 85000,
    },
    status: "open",
  });

  await RoomRole.insertMany([
    { roomId: demoRoom._id, roleTitle: "UI/UX Designer", skillDomain: "UI/UX Design / Figma / Tailwind", requiredLevel: 1, minReputation: 650, status: "open" },
    { roomId: demoRoom._id, roleTitle: "React Frontend Engineer", skillDomain: "React / Frontend / TypeScript / Tailwind", requiredLevel: 1, minReputation: 650, status: "open" },
    { roomId: demoRoom._id, roleTitle: "Node Backend Engineer", skillDomain: "Node.js / Backend / MongoDB / APIs", requiredLevel: 1, minReputation: 650, status: "open" },
    { roomId: demoRoom._id, roleTitle: "Lead Solidity Engineer", skillDomain: "Solidity / Smart Contracts / DeFi", requiredLevel: 2, minReputation: 800, status: "open" },
    { roomId: demoRoom._id, roleTitle: "ZK Cryptographer", skillDomain: "ZK Proofs / Cryptography / Circuits", requiredLevel: 2, minReputation: 850, status: "open" },
    { roomId: demoRoom._id, roleTitle: "DevOps Engineer", skillDomain: "DevOps / AWS / Docker / CI/CD", requiredLevel: 1, minReputation: 650, status: "open" },
  ]);

  console.log("Seed complete:");
  console.log("  business@demo.com / demo123  (Nexus Protocol)");
  console.log(`  ${talents.length} demo talent accounts created with mixed availability and hourly/weekly/monthly rates`);
  console.log("  Demo room: NEXUS001 (open)");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
