import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IProjectEnquiry extends Document {
  roomId: Types.ObjectId;
  businessId: Types.ObjectId;
  message: string;
  sendEmailToOffline: boolean;
  status: "sent" | "partially_sent" | "failed";
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectEnquirySchema = new Schema<IProjectEnquiry>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true },
    sendEmailToOffline: { type: Boolean, default: true },
    status: { type: String, enum: ["sent", "partially_sent", "failed"], default: "sent" },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_project_enquiries" }
);

ProjectEnquirySchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.businessId ??= asDehixId(this.businessId);
  dehix.sourceCollection ??= "projectinvites";
});

ProjectEnquirySchema.index({ "dehix.projectId": 1, createdAt: -1 }, { sparse: true });
ProjectEnquirySchema.index({ "dehix.businessId": 1, "dehix.syncStatus": 1 });

export const ProjectEnquiry = mongoose.model<IProjectEnquiry>("ProjectEnquiry", ProjectEnquirySchema);
