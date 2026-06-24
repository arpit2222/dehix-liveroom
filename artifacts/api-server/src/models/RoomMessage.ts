import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IRoomMessage extends Document {
  roomId: Types.ObjectId;
  channelId: Types.ObjectId;
  senderId?: Types.ObjectId;
  senderName: string;
  type: "user" | "system" | "ai";
  message: string;
  mentions: string[];
  dehix?: DehixSyncMetadata;
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
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_room_messages" }
);

RoomMessageSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.userId ??= asDehixId(this.senderId);
  dehix.entityId ??= asDehixId(this.channelId);
  dehix.sourceCollection ??= "live_room_messages";
});

RoomMessageSchema.index({ channelId: 1, createdAt: 1 });
RoomMessageSchema.index({ "dehix.projectId": 1, createdAt: 1 }, { sparse: true });
RoomMessageSchema.index({ "dehix.userId": 1, createdAt: -1 }, { sparse: true });

export const RoomMessage = mongoose.model<IRoomMessage>("RoomMessage", RoomMessageSchema);
