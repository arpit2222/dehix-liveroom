import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

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
  | "freelancer_matches_generated"
  | "freelancer_shortlisted"
  | "freelancer_enquiry_sent"
  | "freelancer_enquiry_responded"
  | "hire_offer_sent"
  | "hire_offer_accepted"
  | "hire_offer_declined"
  | "hire_offer_changes_requested"
  | "hire_offer_withdrawn"
  | "hire_offer_contracted"
  | "freelancer_hired"
  | "room_contracted"
  | "room_closed";

export interface IRoomActivity extends Document {
  roomId: Types.ObjectId;
  type: ActivityType;
  actorId?: Types.ObjectId;
  actorName?: string;
  meta?: Record<string, unknown>;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
}

const RoomActivitySchema = new Schema<IRoomActivity>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    type: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String },
    meta: { type: Schema.Types.Mixed },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "dl_room_activity" }
);

RoomActivitySchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.userId ??= asDehixId(this.actorId);
  dehix.sourceCollection ??= "live_room_activity";
});

RoomActivitySchema.index({ "dehix.projectId": 1, createdAt: -1 }, { sparse: true });
RoomActivitySchema.index({ "dehix.userId": 1, createdAt: -1 }, { sparse: true });

export const RoomActivity = mongoose.model<IRoomActivity>("RoomActivity", RoomActivitySchema);
