import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomRole extends Document {
  roomId: Types.ObjectId;
  roleTitle: string;
  skillDomain: string;
  requiredLevel: number;
  minReputation: number;
  filledBy?: Types.ObjectId;
  status: "open" | "invited" | "accepted" | "filled";
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
  },
  { collection: "test_livechat_room_roles" }
);

export const RoomRole = mongoose.model<IRoomRole>("RoomRole", RoomRoleSchema);
