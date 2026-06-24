import { Schema } from "mongoose";

export type DehixRole = "BUSINESS" | "FREELANCER";
export type DehixSyncStatus = "local_only" | "mapped" | "synced";

export interface DehixSyncMetadata {
  userId?: string;
  businessId?: string;
  freelancerId?: string;
  freelancerProfileId?: string;
  projectId?: string;
  projectProfileId?: string;
  milestoneId?: string;
  storyId?: string;
  taskId?: string;
  hireId?: string;
  projectInviteId?: string;
  interviewId?: string;
  verificationId?: string;
  reportId?: string;
  notificationId?: string;
  entityId?: string;
  participantIds?: string[];
  role?: DehixRole;
  sourceCollection?: string;
  status?: string;
  syncStatus?: DehixSyncStatus;
  syncedAt?: Date;
}

export const DehixSyncSchema = new Schema<DehixSyncMetadata>(
  {
    userId: { type: String },
    businessId: { type: String },
    freelancerId: { type: String },
    freelancerProfileId: { type: String },
    projectId: { type: String },
    projectProfileId: { type: String },
    milestoneId: { type: String },
    storyId: { type: String },
    taskId: { type: String },
    hireId: { type: String },
    projectInviteId: { type: String },
    interviewId: { type: String },
    verificationId: { type: String },
    reportId: { type: String },
    notificationId: { type: String },
    entityId: { type: String },
    participantIds: [{ type: String }],
    role: { type: String, enum: ["BUSINESS", "FREELANCER"] },
    sourceCollection: { type: String },
    status: { type: String },
    syncStatus: { type: String, enum: ["local_only", "mapped", "synced"], default: "local_only" },
    syncedAt: { type: Date },
  },
  { _id: false }
);

export function defaultDehixSync(): DehixSyncMetadata {
  return { syncStatus: "local_only" };
}

export function asDehixId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const dehix = record["dehix"] as DehixSyncMetadata | undefined;
    if (dehix?.userId) return dehix.userId;
    if (dehix?.businessId) return dehix.businessId;
    if (dehix?.freelancerId) return dehix.freelancerId;
    if (dehix?.projectId) return dehix.projectId;

    const id = record["_id"];
    if (typeof id === "string") return id;
    if (id && typeof (id as { toString?: () => string }).toString === "function") return (id as { toString: () => string }).toString();
  }

  if (typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }

  return String(value);
}

export function toDehixRole(role: unknown): DehixRole | undefined {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "business" || normalized === "business_user") return "BUSINESS";
  if (normalized === "talent" || normalized === "freelancer" || normalized === "consultant") return "FREELANCER";
  return undefined;
}

export function dehixCollectionForRole(role: unknown): "businesses" | "freelancers" | undefined {
  const dehixRole = toDehixRole(role);
  if (dehixRole === "BUSINESS") return "businesses";
  if (dehixRole === "FREELANCER") return "freelancers";
  return undefined;
}

export function mapRoomStatusToDehixProjectStatus(status: unknown): "PENDING" | "ACTIVE" | "COMPLETED" | undefined {
  switch (status) {
    case "scoping":
    case "matching":
      return "PENDING";
    case "open":
    case "assembling":
    case "contracted":
      return "ACTIVE";
    case "closed":
      return "COMPLETED";
    default:
      return undefined;
  }
}

export function mapMilestoneStatusToDehix(status: unknown): "NOT_STARTED" | "ONGOING" | "COMPLETED" | undefined {
  switch (status) {
    case "pending":
      return "NOT_STARTED";
    case "in_progress":
    case "submitted":
    case "approved":
      return "ONGOING";
    case "released":
    case "done":
      return "COMPLETED";
    default:
      return undefined;
  }
}

export function ensureDehixSync(doc: { dehix?: DehixSyncMetadata }): DehixSyncMetadata {
  doc.dehix = { syncStatus: "local_only", ...(doc.dehix ?? {}) };
  return doc.dehix;
}
