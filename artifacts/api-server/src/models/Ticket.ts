import mongoose, { Schema, Document, Types } from "mongoose";
import {
  DehixSyncSchema,
  type DehixSyncMetadata,
  asDehixId,
  ensureDehixSync,
  mapMilestoneStatusToDehix,
} from "../lib/dehixSync.js";

export interface ITicket extends Document {
  roomId: Types.ObjectId;
  title: string;
  description?: string;
  assignedRole?: Types.ObjectId;
  milestoneNumber: number;
  estimatedHours?: number;
  status: "backlog" | "todo" | "in_progress" | "done";
  dehix?: DehixSyncMetadata;
  createdAt: Date;
}

const TicketSchema = new Schema<ITicket>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    title: { type: String, required: true },
    description: { type: String },
    assignedRole: { type: Schema.Types.ObjectId, ref: "RoomRole" },
    milestoneNumber: { type: Number, default: 1 },
    estimatedHours: { type: Number },
    status: { type: String, enum: ["backlog", "todo", "in_progress", "done"], default: "backlog" },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_tickets" }
);

TicketSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.taskId ??= asDehixId(this._id);
  dehix.projectProfileId ??= asDehixId(this.assignedRole);
  dehix.status = mapMilestoneStatusToDehix(this.status) ?? dehix.status;
  dehix.sourceCollection ??= "milestones.stories.tasks";
});

TicketSchema.index({ roomId: 1, milestoneNumber: 1, status: 1 });
TicketSchema.index({ "dehix.projectId": 1, "dehix.taskId": 1 }, { sparse: true });
TicketSchema.index({ "dehix.projectProfileId": 1, status: 1 }, { sparse: true });

export const Ticket = mongoose.model<ITicket>("Ticket", TicketSchema);
