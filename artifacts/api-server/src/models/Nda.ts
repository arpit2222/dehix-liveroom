import mongoose, { Schema, Document, Types } from "mongoose";

export interface INda extends Document {
  roomId: Types.ObjectId;
  content: string;
  signedBy: string[];
  status: "draft" | "pending_signatures" | "signed";
  createdAt: Date;
}

const NdaSchema = new Schema<INda>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true },
    content: { type: String, required: true },
    signedBy: [{ type: String }],
    status: { type: String, enum: ["draft", "pending_signatures", "signed"], default: "draft" },
  },
  { timestamps: true, collection: "dl_ndas" }
);

export const Nda = mongoose.model<INda>("Nda", NdaSchema);
