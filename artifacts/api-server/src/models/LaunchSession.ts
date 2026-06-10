import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILaunchSession extends Document {
  userId: Types.ObjectId;
  projectTitle?: string;
  rawIdea: string;
  businessGoal?: string;
  targetAudience?: string;
  budgetRange?: string;
  timeline?: string;
  projectType?: string;
  status: "draft" | "clarifying" | "generating" | "reviewing" | "approved" | "pushed_to_workspace" | "archived";
  
  summaryText?: string;
  researchText?: string;
  phase1AiOutputText?: string;
  phase1ConfirmedAt?: Date;
  businessDocText?: string;
  technicalDocText?: string;
  technicalAnswersText?: string;
  phase1Status?: "queued" | "generating" | "ready" | "failed";
  phase1Error?: string;
  phase2Status?: "queued" | "generating" | "ready" | "failed";
  phase2Error?: string;
  businessValidationPdfStatus?: "pending" | "ready" | "failed";
  businessValidationPdfPath?: string;
  businessValidationPdfHash?: string;
  businessValidationPdfError?: string;
  businessValidationPdfGeneratedAt?: Date;
  businessBlueprintPdfStatus?: "pending" | "ready" | "failed";
  businessBlueprintPdfPath?: string;
  businessBlueprintPdfHash?: string;
  businessBlueprintPdfError?: string;
  businessBlueprintPdfGeneratedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const LaunchSessionSchema = new Schema<ILaunchSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectTitle: { type: String },
    rawIdea: { type: String, required: true },
    businessGoal: { type: String },
    targetAudience: { type: String },
    budgetRange: { type: String },
    timeline: { type: String },
    projectType: { type: String },
    status: {
      type: String,
      enum: ["draft", "clarifying", "generating", "reviewing", "approved", "pushed_to_workspace", "archived"],
      default: "draft",
    },
    summaryText: { type: String },
    researchText: { type: String },
    phase1AiOutputText: { type: String },
    phase1ConfirmedAt: { type: Date },
    businessDocText: { type: String },
    technicalDocText: { type: String },
    technicalAnswersText: { type: String },
    phase1Status: { type: String, enum: ["queued", "generating", "ready", "failed"] },
    phase1Error: { type: String },
    phase2Status: { type: String, enum: ["queued", "generating", "ready", "failed"] },
    phase2Error: { type: String },
    businessValidationPdfStatus: { type: String, enum: ["pending", "ready", "failed"] },
    businessValidationPdfPath: { type: String },
    businessValidationPdfHash: { type: String },
    businessValidationPdfError: { type: String },
    businessValidationPdfGeneratedAt: { type: Date },
    businessBlueprintPdfStatus: { type: String, enum: ["pending", "ready", "failed"] },
    businessBlueprintPdfPath: { type: String },
    businessBlueprintPdfHash: { type: String },
    businessBlueprintPdfError: { type: String },
    businessBlueprintPdfGeneratedAt: { type: Date },
  },
  { timestamps: true, collection: "dl_launch_sessions" }
);

export const LaunchSession = mongoose.model<ILaunchSession>("LaunchSession", LaunchSessionSchema);
