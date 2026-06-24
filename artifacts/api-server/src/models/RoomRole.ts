import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IRoomRole extends Document {
  roomId: Types.ObjectId;
  roleTitle: string;
  skillDomain: string;
  requiredLevel: number;
  minReputation: number;
  filledBy?: Types.ObjectId;
  status: "open" | "invited" | "accepted" | "filled";
  dehix?: DehixSyncMetadata;
}

const RoomRoleSchema = new Schema<IRoomRole>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    roleTitle: { type: String, required: true },
    skillDomain: { type: String, required: true },
    requiredLevel: { type: Number, default: 1 },
    minReputation: { type: Number, default: 0 },
    filledBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["open", "invited", "accepted", "filled"], default: "open" },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { collection: "dl_room_roles" }
);

RoomRoleSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.projectProfileId ??= asDehixId(this._id);
  dehix.freelancerId ??= asDehixId(this.filledBy);
  dehix.sourceCollection ??= "projects.profiles";
});

RoomRoleSchema.index({ roomId: 1, "dehix.projectProfileId": 1 }, { sparse: true });
RoomRoleSchema.index({ "dehix.projectId": 1, "dehix.syncStatus": 1 });

export const RoomRole = mongoose.model<IRoomRole>("RoomRole", RoomRoleSchema);
