import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface IRoomChannel extends Document {
  roomId: Types.ObjectId;
  type: "general" | "direct" | "interview" | "ai-agent";
  name: string;
  participantIds: Types.ObjectId[];
  roleId?: Types.ObjectId;
  interviewStatus?: "scheduled" | "live" | "completed" | "cancelled";
  interviewMeetLink?: string;
  interviewScheduledAt?: Date;
  interviewNotes?: string;
  dehix?: DehixSyncMetadata & { participantIds?: string[] };
  createdAt: Date;
  updatedAt: Date;
}

const RoomChannelSchema = new Schema<IRoomChannel>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    type: { type: String, enum: ["general", "direct", "interview", "ai-agent"], required: true },
    name: { type: String, required: true },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    interviewStatus: { type: String, enum: ["scheduled", "live", "completed", "cancelled"] },
    interviewMeetLink: { type: String },
    interviewScheduledAt: { type: Date },
    interviewNotes: { type: String },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_room_channels" }
);

RoomChannelSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.projectProfileId ??= asDehixId(this.roleId);
  dehix.interviewId ??= this.type === "interview" ? asDehixId(this._id) : dehix.interviewId;
  dehix.participantIds ??= this.participantIds
    .map((participantId) => asDehixId(participantId))
    .filter(Boolean) as string[];
  dehix.sourceCollection ??= this.type === "interview" ? "interviews" : "live_room_channels";
});

RoomChannelSchema.index({ roomId: 1, type: 1, name: 1 }, { unique: true });
RoomChannelSchema.index({ "dehix.projectId": 1, type: 1 }, { sparse: true });
RoomChannelSchema.index({ "dehix.interviewId": 1 }, { sparse: true });

export const RoomChannel = mongoose.model<IRoomChannel>("RoomChannel", RoomChannelSchema);
