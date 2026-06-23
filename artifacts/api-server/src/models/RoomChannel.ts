import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomChannel extends Document {
  roomId: Types.ObjectId;
  type: "general" | "direct" | "interview";
  name: string;
  participantIds: Types.ObjectId[];
  roleId?: Types.ObjectId;
  interviewStatus?: "scheduled" | "live" | "completed" | "cancelled";
  interviewMeetLink?: string;
  interviewScheduledAt?: Date;
  interviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RoomChannelSchema = new Schema<IRoomChannel>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    type: { type: String, enum: ["general", "direct", "interview"], required: true },
    name: { type: String, required: true },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    interviewStatus: { type: String, enum: ["scheduled", "live", "completed", "cancelled"] },
    interviewMeetLink: { type: String },
    interviewScheduledAt: { type: Date },
    interviewNotes: { type: String },
  },
  { timestamps: true, collection: "dl_room_channels" }
);

RoomChannelSchema.index({ roomId: 1, type: 1, name: 1 }, { unique: true });

export const RoomChannel = mongoose.model<IRoomChannel>("RoomChannel", RoomChannelSchema);
