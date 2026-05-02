import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomParticipant extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  roleId?: Types.ObjectId;
  status: "invited" | "joined" | "accepted" | "declined";
  joinedAt: Date;
}

const RoomParticipantSchema = new Schema<IRoomParticipant>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    status: { type: String, enum: ["invited", "joined", "accepted", "declined"], default: "invited" },
    joinedAt: { type: Date, default: Date.now },
  },
  { collection: "test_livechat_room_participants" }
);

export const RoomParticipant = mongoose.model<IRoomParticipant>("RoomParticipant", RoomParticipantSchema);
