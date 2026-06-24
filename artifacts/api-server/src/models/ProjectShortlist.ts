import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IProjectShortlist extends Document {
  roomId: Types.ObjectId;
  businessId: Types.ObjectId;
  freelancerId: Types.ObjectId;
  roleId?: Types.ObjectId;
  role: string;
  status: "shortlisted" | "removed" | "hired";
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectShortlistSchema = new Schema<IProjectShortlist>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    freelancerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    role: { type: String, required: true },
    status: { type: String, enum: ["shortlisted", "removed", "hired"], default: "shortlisted" },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_project_shortlists" }
);

ProjectShortlistSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.businessId ??= asDehixId(this.businessId);
  dehix.freelancerId ??= asDehixId(this.freelancerId);
  dehix.projectProfileId ??= asDehixId(this.roleId);
  dehix.hireId ??= this.status === "hired" ? asDehixId(this._id) : dehix.hireId;
  dehix.sourceCollection ??= this.status === "hired" ? "hires" : "projectinvites";
});

ProjectShortlistSchema.index({ roomId: 1, freelancerId: 1, roleId: 1 }, { unique: true, sparse: true });
ProjectShortlistSchema.index({ "dehix.projectId": 1, "dehix.freelancerId": 1, "dehix.projectProfileId": 1 }, { sparse: true });
ProjectShortlistSchema.index({ "dehix.hireId": 1 }, { sparse: true });

export const ProjectShortlist = mongoose.model<IProjectShortlist>("ProjectShortlist", ProjectShortlistSchema);
