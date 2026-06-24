import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IRoomParticipant extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  roleId?: Types.ObjectId;
  status: "invited" | "joined" | "accepted" | "declined";
  joinedAt: Date;
  dehix?: DehixSyncMetadata;
}

const RoomParticipantSchema = new Schema<IRoomParticipant>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    status: { type: String, enum: ["invited", "joined", "accepted", "declined"], default: "invited" },
    joinedAt: { type: Date, default: Date.now },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { collection: "dl_room_participants" }
);

RoomParticipantSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.freelancerId ??= asDehixId(this.userId);
  dehix.projectProfileId ??= asDehixId(this.roleId);
  dehix.projectInviteId ??= asDehixId(this._id);
  dehix.sourceCollection ??= "projectinvites";
});

RoomParticipantSchema.index({ roomId: 1, userId: 1 }, { unique: true });
RoomParticipantSchema.index({ "dehix.freelancerId": 1, "dehix.projectId": 1 }, { sparse: true });
RoomParticipantSchema.index({ "dehix.projectInviteId": 1 }, { sparse: true });

export const RoomParticipant = mongoose.model<IRoomParticipant>("RoomParticipant", RoomParticipantSchema);
