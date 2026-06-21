import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomChannel extends Document {
  roomId: Types.ObjectId;
  type: "general" | "direct";
  name: string;
  participantIds: Types.ObjectId[];
  roleId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoomChannelSchema = new Schema<IRoomChannel>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    type: { type: String, enum: ["general", "direct"], required: true },
    name: { type: String, required: true },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
  },
  { timestamps: true, collection: "dl_room_channels" }
);

RoomChannelSchema.index({ roomId: 1, type: 1, name: 1 }, { unique: true });

export const RoomChannel = mongoose.model<IRoomChannel>("RoomChannel", RoomChannelSchema);
