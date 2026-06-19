import type { Types } from "mongoose";
import { SbtCredential } from "../models/SbtCredential.js";
import type { LiveRoom } from "../models/LiveRoom.js";
import type { RoomRole } from "../models/RoomRole.js";

type RoomDoc = InstanceType<typeof LiveRoom>;
type RoleDoc = InstanceType<typeof RoomRole>;

export type MatchCandidate = {
  roomId: Types.ObjectId;
  roleId: Types.ObjectId;
  role: string;
  freelancerId: Types.ObjectId;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  scoreBreakdown: {
    skill: number;
    role: number;
    experience: number;
    availability: number;
    workHistory: number;
    budgetFit: number;
  };
};

const STOP_WORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "developer",
  "engineer",
  "specialist",
  "expert",
  "senior",
  "junior",
  "mid",
  "level",
  "lead",
  "full",
  "stack",
  "role",
]);

const ROLE_KEYWORD_GROUPS: Array<{ triggers: string[]; keywords: string[] }> = [
  { triggers: ["ui", "ux", "figma", "designer", "prototype", "wireframe"], keywords: ["ui", "ux", "ui ux designer", "figma", "wireframes", "prototype", "design system", "tailwind"] },
  { triggers: ["react", "frontend", "next", "dashboard"], keywords: ["react", "next.js", "typescript", "tailwind", "frontend", "dashboard"] },
  { triggers: ["node", "backend", "api", "express", "mongodb"], keywords: ["node.js", "express", "mongodb", "rest api", "backend", "socket.io"] },
  { triggers: ["solidity", "smart contract", "evm", "defi"], keywords: ["solidity", "smart contracts", "evm", "defi", "hardhat", "foundry"] },
  { triggers: ["zk", "zero knowledge", "cryptography"], keywords: ["zk", "zero knowledge", "circom", "noir", "snark", "cryptography"] },
  { triggers: ["devops", "cloud", "aws", "docker"], keywords: ["aws", "docker", "kubernetes", "ci cd", "deployment", "terraform"] },
  { triggers: ["ai", "ml", "llm", "openai"], keywords: ["ai", "llm", "openai", "rag", "machine learning", "chatbot"] },
  { triggers: ["qa", "testing", "playwright"], keywords: ["qa", "testing", "playwright", "automation"] },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function rawTokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function matchesRoleTrigger(text: string, trigger: string): boolean {
  const normalized = normalize(text);
  const normalizedTrigger = normalize(trigger);
  if (!normalized || !normalizedTrigger) return false;
  if (normalizedTrigger.includes(" ")) return normalized.includes(normalizedTrigger);
  if (normalizedTrigger.length <= 3) return rawTokens(normalized).includes(normalizedTrigger);
  return normalized.includes(normalizedTrigger);
}

function containsSkillTerm(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (needle.includes(" ")) return haystack.includes(needle);
  if (needle.length <= 3) {
    const haystackTokens = rawTokens(haystack);
    return haystackTokens.some((token) => token === needle || token === `${needle}s`);
  }
  return haystack.includes(needle);
}

function phrases(value: string): string[] {
  return value
    .split(/[,;/|+()[\]\n]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function textFromUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map(textFromUnknown).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(textFromUnknown).join(" ");
  return "";
}

function parseMoneyValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null) return parseMoneyValue(textFromUnknown(value));
  if (typeof value !== "string") return undefined;

  const normalized = value.toLowerCase().replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|lakh|lac)?/g)];
  const amounts = matches
    .map((match) => {
      const raw = Number(match[1]);
      if (!Number.isFinite(raw)) return 0;
      const suffix = match[2];
      if (suffix === "k") return raw * 1000;
      if (suffix === "m") return raw * 1000000;
      if (suffix === "lakh" || suffix === "lac") return raw * 100000;
      return raw;
    })
    .filter((amount) => amount >= 100);

  return amounts.length > 0 ? Math.max(...amounts) : undefined;
}

function extractRoomBudget(room: RoomDoc): number | undefined {
  const brief = room.aiScopedBrief as any;
  return parseMoneyValue(brief?.suggestedTotalBudgetUsd)
    ?? parseMoneyValue(brief?.talentRecommendationBudgetUsd)
    ?? parseMoneyValue(brief?.budgetUsd)
    ?? parseMoneyValue(brief?.budget)
    ?? parseMoneyValue(brief?.cost_estimation)
    ?? undefined;
}

function requiredSkillsForRole(role: RoleDoc, room: RoomDoc): string[] {
  const brief = room.aiScopedBrief as any;
  const briefRoles = Array.isArray(brief?.roles) ? brief.roles : [];
  const matchingBriefRole = briefRoles.find((item: any) => {
    const title = normalize(String(item?.roleTitle ?? item?.role ?? ""));
    return title && title === normalize(role.roleTitle);
  });
  const fromBrief = textFromUnknown([
    matchingBriefRole?.skillDomain,
    matchingBriefRole?.skills,
    matchingBriefRole?.responsibilities,
  ]);
  const roleText = `${role.roleTitle} ${role.skillDomain} ${fromBrief}`;
  const rawParts = [
    role.skillDomain,
    ...phrases(role.skillDomain),
    ...phrases(fromBrief),
    ...tokens(role.roleTitle).map((token) => token),
    ...ROLE_KEYWORD_GROUPS
      .filter((group) => group.triggers.some((trigger) => matchesRoleTrigger(roleText, trigger)))
      .flatMap((group) => group.keywords),
  ];
  const skills = dedupe(rawParts).filter((part) => !STOP_WORDS.has(normalize(part)));
  return skills.length > 0 ? skills : [role.skillDomain];
}

function skillSimilarity(requiredSkill: string, actualSkill: string): number {
  const required = normalize(requiredSkill);
  const actual = normalize(actualSkill);
  if (!required || !actual) return 0;
  if (required === actual) return 100;
  if (containsSkillTerm(actual, required) || containsSkillTerm(required, actual)) return 90;

  const requiredTokens = tokens(required);
  const actualTokens = new Set(tokens(actual));
  if (requiredTokens.length === 0) return 0;
  const shared = requiredTokens.filter((token) => actualTokens.has(token)).length;
  if (shared === 0) return 0;
  return Math.round((shared / requiredTokens.length) * 85);
}

function calculateSkillMatch(requiredSkills: string[], profileText: string) {
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const requiredSkill of requiredSkills) {
    if (skillSimilarity(requiredSkill, profileText) >= 55) matchedSkills.push(requiredSkill);
    else missingSkills.push(requiredSkill);
  }

  const skill = requiredSkills.length > 0 ? Math.round((matchedSkills.length / requiredSkills.length) * 40) : 0;
  return { skill, matchedSkills, missingSkills };
}

function calculateRoleScore(role: RoleDoc, credentialSkill: string): number {
  const roleText = `${role.roleTitle} ${role.skillDomain}`;
  const roleNorm = normalize(roleText);
  const credentialNorm = normalize(credentialSkill);
  if (!roleNorm || !credentialNorm) return 0;
  if (roleNorm.includes(credentialNorm) || credentialNorm.includes(roleNorm)) return 20;
  const similarity = skillSimilarity(roleText, credentialSkill);
  if (similarity >= 75) return 15;
  if (similarity >= 45) return 10;
  return 0;
}

function calculateExperienceScore(role: RoleDoc, credential: any): number {
  const requiredLevel = Number(role.requiredLevel ?? 1);
  const credentialLevel = Number(credential.level ?? 1);
  const projects = Number(credential.projectsCompleted ?? 0);
  if (credentialLevel >= requiredLevel) return 15;
  if (requiredLevel <= 1) return 12;
  if (projects >= 8) return 12;
  if (projects >= 3) return 8;
  return 5;
}

function calculateAvailabilityScore(user: any): number {
  if (user?.isOnline) return 10;
  switch (user?.availability) {
    case "available":
      return 8;
    case "available_soon":
      return 7;
    case "part_time":
      return 6;
    case "busy":
      return 3;
    case "unavailable":
      return 0;
    default:
      return 3;
  }
}

function availabilityRank(user: any): number {
  if (user?.isOnline && user?.availability !== "unavailable") return 4;
  switch (user?.availability) {
    case "available":
      return 3;
    case "available_soon":
    case "part_time":
      return 2;
    case "busy":
    case "unknown":
      return 1;
    default:
      return 0;
  }
}

function calculateWorkHistoryScore(user: any, credential: any): number {
  const rating = Number(user?.rating ?? 0);
  const projects = Number(user?.completedProjects ?? credential.projectsCompleted ?? 0);
  if (rating >= 4.5 && projects >= 10) return 10;
  if (rating >= 4 && projects >= 5) return 8;
  if (projects >= 10) return 8;
  if (projects >= 5) return 7;
  if (projects === 0) return 5;
  return 4;
}

function calculateBudgetFitScore(room: RoomDoc, roles: RoleDoc[], user: any): number {
  const rate = Number(user?.monthlyRate ?? (user?.hourlyRate ? user.hourlyRate * 160 : 0));
  if (!rate || !Number.isFinite(rate)) return 2;
  const budget = extractRoomBudget(room);
  if (!budget) return 3;
  const roleBudget = budget / Math.max(roles.length, 1);
  if (rate <= roleBudget) return 5;
  if (rate <= roleBudget * 1.15) return 3;
  return 1;
}

function isEligibleTalent(user: any): boolean {
  if (!user || user.role !== "talent") return false;
  if (user.profileCompleted === false) return false;
  if (["blocked", "suspended"].includes(String(user.accountStatus ?? "active"))) return false;
  return true;
}

function buildCandidate(room: RoomDoc, roles: RoleDoc[], role: RoleDoc, credential: any): MatchCandidate | null {
  const user = credential.userId as any;
  if (!isEligibleTalent(user)) return null;
  if (Number(credential.reputationScore ?? 0) < Number(role.minReputation ?? 0)) return null;

  const requiredSkills = requiredSkillsForRole(role, room);
  const profileText = [credential.skillDomain, credential.embeddingText].filter(Boolean).join(" ");
  const skillResult = calculateSkillMatch(requiredSkills, profileText);
  if (skillResult.matchedSkills.length === 0) return null;

  const scoreBreakdown = {
    skill: skillResult.skill,
    role: calculateRoleScore(role, String(credential.skillDomain ?? "")),
    experience: calculateExperienceScore(role, credential),
    availability: calculateAvailabilityScore(user),
    workHistory: calculateWorkHistoryScore(user, credential),
    budgetFit: calculateBudgetFitScore(room, roles, user),
  };
  const matchScore = Math.max(0, Math.min(100, Math.round(Object.values(scoreBreakdown).reduce((sum, score) => sum + score, 0))));

  return {
    roomId: room._id,
    roleId: role._id,
    role: role.roleTitle,
    freelancerId: user._id,
    matchScore,
    matchedSkills: skillResult.matchedSkills,
    missingSkills: skillResult.missingSkills,
    scoreBreakdown,
  };
}

export async function calculateRoomFreelancerMatches(room: RoomDoc, roles: RoleDoc[], topK: number): Promise<MatchCandidate[]> {
  const credentials = await SbtCredential.find({ status: "verified" })
    .populate(
      "userId",
      "name email avatarUrl walletAddress isOnline role lastSeen createdAt emailVerified profileCompleted accountStatus availability location remote hourlyRate monthlyRate rating completedProjects notificationPreferences"
    )
    .sort({ reputationScore: -1 })
    .limit(500);

  const allMatches: MatchCandidate[] = [];
  for (const role of roles) {
    const bestByFreelancer = new Map<string, MatchCandidate>();
    for (const credential of credentials) {
      const candidate = buildCandidate(room, roles, role, credential);
      if (!candidate) continue;
      const key = String(candidate.freelancerId);
      const previous = bestByFreelancer.get(key);
      if (!previous || candidate.matchScore > previous.matchScore) {
        bestByFreelancer.set(key, candidate);
      }
    }
    allMatches.push(
      ...[...bestByFreelancer.values()]
        .sort((a, b) => {
          const aUser = credentials.find((credential: any) => String((credential.userId as any)?._id) === String(a.freelancerId))?.userId as any;
          const bUser = credentials.find((credential: any) => String((credential.userId as any)?._id) === String(b.freelancerId))?.userId as any;
          const availabilityDiff = availabilityRank(bUser) - availabilityRank(aUser);
          if (availabilityDiff !== 0) return availabilityDiff;
          return b.matchScore - a.matchScore;
        })
        .slice(0, topK)
    );
  }

  return allMatches;
}
