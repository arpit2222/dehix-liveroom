import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export type EnquiryResponseStatus = "pending" | "interested" | "not_interested" | "ask_question" | "proposal_submitted";

export interface IProjectEnquiryRecipient extends Document {
  enquiryId: Types.ObjectId;
  roomId: Types.ObjectId;
  freelancerId: Types.ObjectId;
  roleId?: Types.ObjectId;
  role: string;
  matchScore?: number;
  matchedSkills: string[];
  presenceStatusAtSend: "online" | "offline";
  emailStatus: "not_required" | "queued" | "sent" | "skipped" | "failed";
  notificationStatus: "sent" | "skipped" | "failed";
  responseStatus: EnquiryResponseStatus;
  responseMessage?: string;
  respondedAt?: Date;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectEnquiryRecipientSchema = new Schema<IProjectEnquiryRecipient>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "ProjectEnquiry", required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    freelancerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    role: { type: String, required: true },
    matchScore: { type: Number, min: 0, max: 100 },
    matchedSkills: [{ type: String }],
    presenceStatusAtSend: { type: String, enum: ["online", "offline"], required: true },
    emailStatus: {
      type: String,
      enum: ["not_required", "queued", "sent", "skipped", "failed"],
      default: "not_required",
    },
    notificationStatus: { type: String, enum: ["sent", "skipped", "failed"], default: "sent" },
    responseStatus: {
      type: String,
      enum: ["pending", "interested", "not_interested", "ask_question", "proposal_submitted"],
      default: "pending",
      index: true,
    },
    responseMessage: { type: String },
    respondedAt: { type: Date },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_project_enquiry_recipients" }
);

ProjectEnquiryRecipientSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.freelancerId ??= asDehixId(this.freelancerId);
  dehix.projectProfileId ??= asDehixId(this.roleId);
  dehix.projectInviteId ??= asDehixId(this._id);
  dehix.sourceCollection ??= "projectinvites";
});

ProjectEnquiryRecipientSchema.index({ roomId: 1, freelancerId: 1, roleId: 1, createdAt: -1 });
ProjectEnquiryRecipientSchema.index({ "dehix.projectId": 1, "dehix.freelancerId": 1, "dehix.projectProfileId": 1 }, { sparse: true });
ProjectEnquiryRecipientSchema.index({ "dehix.projectInviteId": 1 }, { sparse: true });

export const ProjectEnquiryRecipient = mongoose.model<IProjectEnquiryRecipient>(
  "ProjectEnquiryRecipient",
  ProjectEnquiryRecipientSchema
);
