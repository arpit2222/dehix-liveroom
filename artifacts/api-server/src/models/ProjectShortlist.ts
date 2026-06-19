import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProjectShortlist extends Document {
  roomId: Types.ObjectId;
  businessId: Types.ObjectId;
  freelancerId: Types.ObjectId;
  roleId?: Types.ObjectId;
  role: string;
  status: "shortlisted" | "removed" | "hired";
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
  },
  { timestamps: true, collection: "dl_project_shortlists" }
);

ProjectShortlistSchema.index({ roomId: 1, freelancerId: 1, roleId: 1 }, { unique: true, sparse: true });

export const ProjectShortlist = mongoose.model<IProjectShortlist>("ProjectShortlist", ProjectShortlistSchema);
