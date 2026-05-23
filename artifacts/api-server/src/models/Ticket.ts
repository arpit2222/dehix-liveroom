import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITicket extends Document {
  roomId: Types.ObjectId;
  title: string;
  description?: string;
  assignedRole?: Types.ObjectId;
  milestoneNumber: number;
  estimatedHours?: number;
  status: "backlog" | "todo" | "in_progress" | "done";
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
  },
  { timestamps: true, collection: "dl_tickets" }
);

export const Ticket = mongoose.model<ITicket>("Ticket", TicketSchema);
