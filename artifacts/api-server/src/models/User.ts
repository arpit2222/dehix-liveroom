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
  emailVerified: boolean;
  profileCompleted: boolean;
  accountStatus: "active" | "blocked" | "suspended";
  availability: "available" | "available_soon" | "part_time" | "busy" | "unavailable" | "unknown";
  location?: string;
  remote: boolean;
  hourlyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number;
  rating?: number;
  completedProjects?: number;
  notificationPreferences?: {
    projectEnquiryEmail?: boolean;
    inAppNotifications?: boolean;
  };
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
    emailVerified: { type: Boolean, default: true },
    profileCompleted: { type: Boolean, default: true },
    accountStatus: { type: String, enum: ["active", "blocked", "suspended"], default: "active", index: true },
    availability: {
      type: String,
      enum: ["available", "available_soon", "part_time", "busy", "unavailable", "unknown"],
      default: "available",
      index: true,
    },
    location: { type: String },
    remote: { type: Boolean, default: true },
    hourlyRate: { type: Number, min: 0 },
    weeklyRate: { type: Number, min: 0 },
    monthlyRate: { type: Number, min: 0 },
    rating: { type: Number, min: 0, max: 5 },
    completedProjects: { type: Number, min: 0 },
    notificationPreferences: {
      projectEnquiryEmail: { type: Boolean, default: true },
      inAppNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: "dl_users" }
);

export const User = mongoose.model<IUser>("User", UserSchema);
