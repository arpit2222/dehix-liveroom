import mongoose, { Schema, Document, Types } from "mongoose";

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
  },
  { collection: "test_livechat_sbt_credentials" }
);

export const SbtCredential = mongoose.model<ISbtCredential>("SbtCredential", SbtCredentialSchema);
