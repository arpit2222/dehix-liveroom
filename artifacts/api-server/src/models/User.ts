import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: "talent" | "business";
  avatarUrl?: string;
  walletAddress?: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["talent", "business"], required: true },
    avatarUrl: { type: String },
    walletAddress: { type: String, unique: true, sparse: true },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "test_livechat_users" }
);

export const User = mongoose.model<IUser>("User", UserSchema);
