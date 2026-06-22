import mongoose, { Schema, Document, Types } from "mongoose";

export type LaunchReportPhase = "analysis" | "blueprint";
export type LaunchReportSectionStatus = "generating" | "ready" | "failed";

export interface ILaunchReportSection extends Document {
  sessionId: Types.ObjectId;
  phase: LaunchReportPhase;
  sectionKey: string;
  status: LaunchReportSectionStatus;
  content?: string;
  sourceHash: string;
  error?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LaunchReportSectionSchema = new Schema<ILaunchReportSection>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "LaunchSession", required: true },
    phase: { type: String, enum: ["analysis", "blueprint"], required: true },
    sectionKey: { type: String, required: true },
    status: { type: String, enum: ["generating", "ready", "failed"], required: true, default: "generating" },
    content: { type: String },
    sourceHash: { type: String, required: true },
    error: { type: String },
    generatedAt: { type: Date },
  },
  { timestamps: true, collection: "dl_launch_report_sections" }
);

LaunchReportSectionSchema.index({ sessionId: 1, phase: 1, sectionKey: 1 }, { unique: true });

export const LaunchReportSection = mongoose.model<ILaunchReportSection>("LaunchReportSection", LaunchReportSectionSchema);
