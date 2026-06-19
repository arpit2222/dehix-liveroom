import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFreelancerMatch extends Document {
  roomId: Types.ObjectId;
  roleId: Types.ObjectId;
  role: string;
  freelancerId: Types.ObjectId;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  scoreBreakdown: {
    skill: number;
    role: number;
    experience: number;
    availability: number;
    workHistory: number;
    budgetFit: number;
  };
  status: "recommended" | "shortlisted" | "enquired" | "hired" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
}

const FreelancerMatchSchema = new Schema<IFreelancerMatch>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole", required: true, index: true },
    role: { type: String, required: true },
    freelancerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    matchedSkills: [{ type: String }],
    missingSkills: [{ type: String }],
    scoreBreakdown: {
      skill: { type: Number, default: 0 },
      role: { type: Number, default: 0 },
      experience: { type: Number, default: 0 },
      availability: { type: Number, default: 0 },
      workHistory: { type: Number, default: 0 },
      budgetFit: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["recommended", "shortlisted", "enquired", "hired", "dismissed"],
      default: "recommended",
      index: true,
    },
  },
  { timestamps: true, collection: "dl_freelancer_matches" }
);

FreelancerMatchSchema.index({ roomId: 1, roleId: 1, freelancerId: 1 }, { unique: true });
FreelancerMatchSchema.index({ roomId: 1, roleId: 1, matchScore: -1 });

export const FreelancerMatch = mongoose.model<IFreelancerMatch>("FreelancerMatch", FreelancerMatchSchema);
