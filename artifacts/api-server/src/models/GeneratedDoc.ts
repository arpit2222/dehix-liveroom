import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IGeneratedDoc extends Document {
  roomId?: Types.ObjectId;
  documentType: string;
  title: string;
  content: string;
  messageCount: number;
  createdBy?: string;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
}

const GeneratedDocSchema = new Schema<IGeneratedDoc>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom" },
    documentType: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    messageCount: { type: Number, default: 0 },
    createdBy: { type: String },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_generated_docs" }
);

GeneratedDocSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.reportId ??= asDehixId(this._id);
  dehix.userId ??= this.createdBy;
  dehix.sourceCollection ??= "reports";
});

GeneratedDocSchema.index({ "dehix.projectId": 1, documentType: 1, createdAt: -1 }, { sparse: true });
GeneratedDocSchema.index({ "dehix.reportId": 1 }, { sparse: true });

export const GeneratedDoc = mongoose.model<IGeneratedDoc>("GeneratedDoc", GeneratedDocSchema);
