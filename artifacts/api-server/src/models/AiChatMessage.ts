import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAiChatMessage extends Document {
  threadId: string;
  launchSessionId?: Types.ObjectId;
  roomId?: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  role: "user" | "assistant";
  message: string;
  isAi: boolean;
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
  },
  { timestamps: true, collection: "dl_ai_chat_messages" }
);

AiChatMessageSchema.index({ threadId: 1, createdAt: 1 });

export const AiChatMessage = mongoose.model<IAiChatMessage>("AiChatMessage", AiChatMessageSchema);
