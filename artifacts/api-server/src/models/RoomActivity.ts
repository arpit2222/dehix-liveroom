import mongoose, { Schema, Document, Types } from "mongoose";

export type ActivityType =
  | "room_created"
  | "status_changed"
  | "participant_joined"
  | "participant_removed"
  | "participant_invited"
  | "brief_generated"
  | "nda_generated"
  | "nda_signed"
  | "milestone_created"
  | "milestone_released"
  | "milestone_submitted"
  | "ticket_created"
  | "notes_updated"
  | "room_contracted"
  | "room_closed";

export interface IRoomActivity extends Document {
  roomId: Types.ObjectId;
  type: ActivityType;
  actorId?: Types.ObjectId;
  actorName?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const RoomActivitySchema = new Schema<IRoomActivity>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    type: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "test_livechat_room_activity" }
);

export const RoomActivity = mongoose.model<IRoomActivity>("RoomActivity", RoomActivitySchema);
