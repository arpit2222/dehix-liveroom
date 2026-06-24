import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IAiChatMessage extends Document {
  threadId: string;
  launchSessionId?: Types.ObjectId;
  roomId?: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  role: "user" | "assistant";
  message: string;
  isAi: boolean;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const AiChatMessageSchema = new Schema<IAiChatMessage>(
  {
    threadId: { type: String, required: true, index: true },
    launchSessionId: { type: Schema.Types.ObjectId, ref: "LaunchSession" },
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    message: { type: String, required: true },
    isAi: { type: Boolean, required: true },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_ai_chat_messages" }
);

AiChatMessageSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.userId ??= asDehixId(this.userId);
  dehix.entityId ??= this.threadId;
  dehix.sourceCollection ??= "notes";
});

AiChatMessageSchema.index({ threadId: 1, createdAt: 1 });
AiChatMessageSchema.index({ "dehix.projectId": 1, createdAt: 1 }, { sparse: true });
AiChatMessageSchema.index({ "dehix.userId": 1, createdAt: -1 }, { sparse: true });

export const AiChatMessage = mongoose.model<IAiChatMessage>("AiChatMessage", AiChatMessageSchema);
