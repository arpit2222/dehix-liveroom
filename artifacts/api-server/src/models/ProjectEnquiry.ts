import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProjectEnquiry extends Document {
  roomId: Types.ObjectId;
  businessId: Types.ObjectId;
  message: string;
  sendEmailToOffline: boolean;
  status: "sent" | "partially_sent" | "failed";
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
  },
  { timestamps: true, collection: "dl_project_enquiries" }
);

export const ProjectEnquiry = mongoose.model<IProjectEnquiry>("ProjectEnquiry", ProjectEnquirySchema);
