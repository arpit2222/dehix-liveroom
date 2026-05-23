import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGeneratedDoc extends Document {
  roomId?: Types.ObjectId;
  documentType: string;
  title: string;
  content: string;
  messageCount: number;
  createdBy?: string;
  createdAt: Date;
}

const GeneratedDocSchema = new Schema<IGeneratedDoc>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom" },
    documentType: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    messageCount: { type: Number, default: 0 },
    createdBy: { type: String },
  },
  { timestamps: true, collection: "dl_generated_docs" }
);

export const GeneratedDoc = mongoose.model<IGeneratedDoc>("GeneratedDoc", GeneratedDocSchema);
