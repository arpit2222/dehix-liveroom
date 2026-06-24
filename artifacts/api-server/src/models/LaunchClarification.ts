import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface ILaunchClarification extends Document {
  sessionId: Types.ObjectId;
  question: string;
  answer?: string;
  orderIndex: number;
  dehix?: DehixSyncMetadata;
}

const LaunchClarificationSchema = new Schema<ILaunchClarification>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "LaunchSession", required: true },
    question: { type: String, required: true },
    answer: { type: String },
    orderIndex: { type: Number, required: true, default: 0 },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { collection: "dl_launch_clarifications" }
);

LaunchClarificationSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.entityId ??= asDehixId(this.sessionId);
  dehix.sourceCollection ??= "projects";
});

LaunchClarificationSchema.index({ "dehix.projectId": 1, orderIndex: 1 }, { sparse: true });

export const LaunchClarification = mongoose.model<ILaunchClarification>("LaunchClarification", LaunchClarificationSchema);
