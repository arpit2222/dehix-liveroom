import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: "project_enquiry" | "room_invite" | "hire_offer" | "system";
  title: string;
  message: string;
  roomId?: Types.ObjectId;
  enquiryRecipientId?: Types.ObjectId;
  read: boolean;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["project_enquiry", "room_invite", "hire_offer", "system"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom" },
    enquiryRecipientId: { type: Schema.Types.ObjectId, ref: "ProjectEnquiryRecipient" },
    read: { type: Boolean, default: false },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_notifications" }
);

NotificationSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.userId ??= asDehixId(this.userId);
  dehix.notificationId ??= asDehixId(this._id);
  dehix.entityId ??= asDehixId(this.enquiryRecipientId) ?? asDehixId(this.roomId);
  dehix.sourceCollection ??= "usernotifications";
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ "dehix.userId": 1, read: 1, createdAt: -1 }, { sparse: true });
NotificationSchema.index({ "dehix.notificationId": 1 }, { sparse: true });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
