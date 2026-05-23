import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILaunchClarification extends Document {
  sessionId: Types.ObjectId;
  question: string;
  answer?: string;
  orderIndex: number;
}

const LaunchClarificationSchema = new Schema<ILaunchClarification>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "LaunchSession", required: true },
    question: { type: String, required: true },
    answer: { type: String },
    orderIndex: { type: Number, required: true, default: 0 },
  },
  { collection: "dl_launch_clarifications" }
);

export const LaunchClarification = mongoose.model<ILaunchClarification>("LaunchClarification", LaunchClarificationSchema);
