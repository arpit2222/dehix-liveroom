import mongoose, { Schema, Document, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: "project_enquiry" | "room_invite" | "system";
  title: string;
  message: string;
  roomId?: Types.ObjectId;
  enquiryRecipientId?: Types.ObjectId;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["project_enquiry", "room_invite", "system"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom" },
    enquiryRecipientId: { type: Schema.Types.ObjectId, ref: "ProjectEnquiryRecipient" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "dl_notifications" }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
