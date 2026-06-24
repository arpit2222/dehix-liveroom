import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface INda extends Document {
  roomId: Types.ObjectId;
  content: string;
  signedBy: string[];
  status: "draft" | "pending_signatures" | "signed";
  dehix?: DehixSyncMetadata;
  createdAt: Date;
}

const NdaSchema = new Schema<INda>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    content: { type: String, required: true },
    signedBy: [{ type: String }],
    status: { type: String, enum: ["draft", "pending_signatures", "signed"], default: "draft" },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_ndas" }
);

NdaSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.verificationId ??= asDehixId(this._id);
  dehix.sourceCollection ??= "verifications";
  dehix.status = this.status === "signed" ? "VERIFIED" : "PENDING";
});

NdaSchema.index({ roomId: 1 }, { unique: true });
NdaSchema.index({ "dehix.projectId": 1, "dehix.verificationId": 1 }, { sparse: true });

export const Nda = mongoose.model<INda>("Nda", NdaSchema);
