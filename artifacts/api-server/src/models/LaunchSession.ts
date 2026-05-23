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
  businessDocText?: string;
  technicalDocText?: string;
  
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
    businessDocText: { type: String },
    technicalDocText: { type: String },
  },
  { timestamps: true, collection: "dl_launch_sessions" }
);

export const LaunchSession = mongoose.model<ILaunchSession>("LaunchSession", LaunchSessionSchema);
