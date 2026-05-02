import mongoose, { Schema, Document, Types } from "mongoose";

export interface IMilestone extends Document {
  roomId: Types.ObjectId;
  title: string;
  description?: string;
  amountUsd?: number;
  dueDate?: Date;
  status: "pending" | "in_progress" | "submitted" | "approved" | "released";
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    title: { type: String, required: true },
    description: { type: String },
    amountUsd: { type: Number },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ["pending", "in_progress", "submitted", "approved", "released"],
      default: "pending",
    },
  },
  { collection: "test_livechat_milestones" }
);

export const Milestone = mongoose.model<IMilestone>("Milestone", MilestoneSchema);
