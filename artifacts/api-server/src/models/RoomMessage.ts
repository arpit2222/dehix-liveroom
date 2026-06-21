import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomMessage extends Document {
  roomId: Types.ObjectId;
  channelId: Types.ObjectId;
  senderId?: Types.ObjectId;
  senderName: string;
  type: "user" | "system" | "ai";
  message: string;
  mentions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const RoomMessageSchema = new Schema<IRoomMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    channelId: { type: Schema.Types.ObjectId, ref: "RoomChannel", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, required: true },
    type: { type: String, enum: ["user", "system", "ai"], required: true },
    message: { type: String, required: true },
    mentions: [{ type: String }],
  },
  { timestamps: true, collection: "dl_room_messages" }
);

RoomMessageSchema.index({ channelId: 1, createdAt: 1 });

export const RoomMessage = mongoose.model<IRoomMessage>("RoomMessage", RoomMessageSchema);
