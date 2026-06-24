import mongoose, { Schema, Document, Types } from "mongoose";
import {
  DehixSyncSchema,
  type DehixSyncMetadata,
  asDehixId,
  ensureDehixSync,
  mapRoomStatusToDehixProjectStatus,
} from "../lib/dehixSync.js";

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
  dehix?: DehixSyncMetadata;
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
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_live_rooms" }
);

LiveRoomSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.businessId ??= asDehixId(this.businessId);
  dehix.projectId ??= asDehixId(this._id);
  dehix.status = mapRoomStatusToDehixProjectStatus(this.status) ?? dehix.status;
  dehix.sourceCollection ??= "projects";
});

LiveRoomSchema.index({ "dehix.projectId": 1 }, { sparse: true });
LiveRoomSchema.index({ "dehix.businessId": 1, "dehix.syncStatus": 1 });

export const LiveRoom = mongoose.model<ILiveRoom>("LiveRoom", LiveRoomSchema);
