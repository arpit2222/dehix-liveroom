import mongoose, { Schema, Document, Types } from "mongoose";
import { DehixSyncSchema, type DehixSyncMetadata, asDehixId, ensureDehixSync } from "../lib/dehixSync.js";

export type HireOfferStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "changes_requested"
  | "withdrawn"
  | "expired"
  | "contracted";

export type HireOfferRateType = "fixed" | "hourly" | "weekly" | "monthly";

export interface IHireOfferMilestone {
  title: string;
  description?: string;
  amountUsd?: number;
  dueDate?: Date;
}

export interface IHireOffer extends Document {
  roomId: Types.ObjectId;
  businessId: Types.ObjectId;
  freelancerId: Types.ObjectId;
  roleId: Types.ObjectId;
  interviewChannelId: Types.ObjectId;
  status: HireOfferStatus;
  amountUsd?: number;
  rateType: HireOfferRateType;
  rateAmountUsd?: number;
  startDate?: Date;
  expectedEndDate?: Date;
  scopeSummary: string;
  terms: string;
  milestonePlan: IHireOfferMilestone[];
  responseMessage?: string;
  sentAt?: Date;
  respondedAt?: Date;
  withdrawnAt?: Date;
  contractedAt?: Date;
  expiresAt?: Date;
  dehix?: DehixSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const HireOfferMilestoneSchema = new Schema<IHireOfferMilestone>(
  {
    title: { type: String, required: true },
    description: { type: String },
    amountUsd: { type: Number },
    dueDate: { type: Date },
  },
  { _id: false }
);

const HireOfferSchema = new Schema<IHireOffer>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "LiveRoom", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    freelancerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "RoomRole", required: true, index: true },
    interviewChannelId: { type: Schema.Types.ObjectId, ref: "RoomChannel", required: true },
    status: {
      type: String,
      enum: ["draft", "sent", "accepted", "declined", "changes_requested", "withdrawn", "expired", "contracted"],
      default: "sent",
      index: true,
    },
    amountUsd: { type: Number },
    rateType: { type: String, enum: ["fixed", "hourly", "weekly", "monthly"], default: "fixed" },
    rateAmountUsd: { type: Number },
    startDate: { type: Date },
    expectedEndDate: { type: Date },
    scopeSummary: { type: String, required: true },
    terms: { type: String, required: true },
    milestonePlan: { type: [HireOfferMilestoneSchema], default: [] },
    responseMessage: { type: String },
    sentAt: { type: Date },
    respondedAt: { type: Date },
    withdrawnAt: { type: Date },
    contractedAt: { type: Date },
    expiresAt: { type: Date },
    dehix: { type: DehixSyncSchema, default: () => ({}) },
  },
  { timestamps: true, collection: "dl_hire_offers" }
);

HireOfferSchema.pre("validate", function () {
  const dehix = ensureDehixSync(this);
  dehix.businessId ??= asDehixId(this.businessId);
  dehix.freelancerId ??= asDehixId(this.freelancerId);
  dehix.projectId ??= asDehixId(this.roomId);
  dehix.projectProfileId ??= asDehixId(this.roleId);
  dehix.interviewId ??= asDehixId(this.interviewChannelId);
  dehix.hireId ??= ["accepted", "contracted"].includes(this.status) ? asDehixId(this._id) : dehix.hireId;
  dehix.projectInviteId ??= asDehixId(this._id);
  dehix.status = this.status;
  dehix.sourceCollection = ["accepted", "contracted"].includes(this.status) ? "hires" : "projectinvites";
});

HireOfferSchema.index({ roomId: 1, roleId: 1, freelancerId: 1, status: 1 });
HireOfferSchema.index({ roomId: 1, roleId: 1, status: 1 });
HireOfferSchema.index({ freelancerId: 1, status: 1, createdAt: -1 });
HireOfferSchema.index({ "dehix.hireId": 1 }, { sparse: true });
HireOfferSchema.index({ "dehix.projectId": 1, "dehix.freelancerId": 1, "dehix.projectProfileId": 1 }, { sparse: true });

export const HireOffer = mongoose.model<IHireOffer>("HireOffer", HireOfferSchema);
