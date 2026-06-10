import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILiveRoom extends Document {
  roomCode: string;
  businessId: Types.ObjectId;
  launchSessionId?: Types.ObjectId;
  title: string;
  rawDescription: string;
  aiScopedBrief?: Record<string, unknown>;
  status: "scoping" | "matching" | "open" | "assembling" | "contracted" | "closed";
  meetLink?: string;
  notes?: string;
  contractedAt?: Date;
  createdAt: Date;
}

const LiveRoomSchema = new Schema<ILiveRoom>(
  {
    roomCode: { type: String, required: true, unique: true },
    businessId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    launchSessionId: { type: Schema.Types.ObjectId, ref: "LaunchSession" },
    title: { type: String, required: true },
    rawDescription: { type: String, required: true },
    aiScopedBrief: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["scoping", "matching", "open", "assembling", "contracted", "closed"],
      default: "scoping",
    },
    meetLink: { type: String },
    notes: { type: String },
    contractedAt: { type: Date },
  },
  { timestamps: true, collection: "dl_live_rooms" }
);

export const LiveRoom = mongoose.model<ILiveRoom>("LiveRoom", LiveRoomSchema);
