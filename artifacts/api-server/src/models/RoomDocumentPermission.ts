import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRoomDocumentPermission extends Document {
  roomId: Types.ObjectId;
  participantId: Types.ObjectId;
  talentId: Types.ObjectId;
  docType: string;
  canView: boolean;
  grantedBy: Types.ObjectId;
  grantedAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RoomDocumentPermissionSchema = new Schema<IRoomDocumentPermission>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    participantId: { type: Schema.Types.ObjectId, ref: "RoomParticipant", required: true },
    talentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    docType: { type: String, required: true },
    canView: { type: Boolean, required: true, default: false },
    grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: "dl_room_document_permissions" }
);

RoomDocumentPermissionSchema.index({ roomId: 1, talentId: 1, docType: 1 }, { unique: true });

export const RoomDocumentPermission = mongoose.model<IRoomDocumentPermission>("RoomDocumentPermission", RoomDocumentPermissionSchema);
