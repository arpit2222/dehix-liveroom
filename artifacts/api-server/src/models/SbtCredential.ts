import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface ISbtCredential extends Document {
  userId: Types.ObjectId;
  skillDomain: string;
  level: 1 | 2;
  reputationScore: number;
  status: "verified" | "disputed" | "revoked";
  githubScore: number;
  interviewScore: number;
  projectsCompleted: number;
  onChainTx?: string;
  issuedAt: Date;
  embeddingText?: string;
  dehix?: DehixSyncMetadata;
}

const SbtCredentialSchema = new Schema<ISbtCredential>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    skillDomain: { type: String, required: true },
    level: { type: Number, enum: [1, 2], required: true },
    reputationScore: { type: Number, default: 0, min: 0, max: 1000 },
    status: { type: String, enum: ["verified", "disputed", "revoked"], default: "verified" },
    githubScore: { type: Number, default: 0 },
    interviewScore: { type: Number, default: 0 },
    projectsCompleted: { type: Number, default: 0 },
    onChainTx: { type: String },
    issuedAt: { type: Date, default: Date.now },
    embeddingText: { type: String },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { collection: "dl_sbt_credentials" }
);

SbtCredentialSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.freelancerId ??= asDehixId(this.userId);
  dehix.verificationId ??= asDehixId(this._id);
  dehix.sourceCollection ??= "freelancers.attributes";
  dehix.status ??= this.status === "verified" ? "VERIFIED" : this.status === "revoked" ? "REJECTED" : "PENDING";
});

SbtCredentialSchema.index({ "dehix.freelancerId": 1, skillDomain: 1 }, { sparse: true });
SbtCredentialSchema.index({ "dehix.verificationId": 1 }, { sparse: true });

export const SbtCredential = mongoose.model<ISbtCredential>("SbtCredential", SbtCredentialSchema);
