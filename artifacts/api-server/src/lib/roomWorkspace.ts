import type { Server } from "socket.io";
import type { Types } from "mongoose";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomChannel } from "../models/RoomChannel.js";
import { RoomMessage } from "../models/RoomMessage.js";
import { RoomDocumentPermission } from "../models/RoomDocumentPermission.js";
import { GeneratedDoc } from "../models/GeneratedDoc.js";
import { User } from "../models/User.js";

type RoomDoc = InstanceType<typeof LiveRoom>;
type ParticipantDoc = InstanceType<typeof RoomParticipant>;
type ChannelDoc = InstanceType<typeof RoomChannel>;
type MessageDoc = InstanceType<typeof RoomMessage>;

export const ROOM_MEMBER_STATUSES = ["joined", "accepted"] as const;
export const ROOM_INTERVIEW_ELIGIBLE_STATUSES = ["invited", "joined", "accepted"] as const;

export const STANDARD_ROOM_DOCUMENTS = [
  { docType: "business_validation", title: "Business Validation", source: "standard" },
  { docType: "business_blueprint", title: "Business Blueprint", source: "standard" },
  { docType: "full_business_blueprint", title: "Full Business Blueprint", source: "standard" },
  { docType: "executive_summary", title: "Executive Summary", source: "standard" },
  { docType: "mvp_scope", title: "MVP Scope", source: "standard" },
  { docType: "technical_architecture", title: "Technical Architecture", source: "standard" },
  { docType: "freelancer_hiring_brief", title: "Freelancer Hiring Brief", source: "standard" },
  { docType: "roadmap_budget", title: "Roadmap and Budget", source: "standard" },
] as const;

export function isRoomOwner(room: RoomDoc, userId: string | undefined): boolean {
  return Boolean(userId && String(room.businessId) === userId);
}

export async function getActiveParticipant(roomId: string | Types.ObjectId, userId: string | undefined): Promise<ParticipantDoc | null> {
  if (!userId) return null;
  return RoomParticipant.findOne({
    roomId,
    userId,
    status: { $in: ROOM_MEMBER_STATUSES },
  });
}

export async function ensureGeneralChannel(roomId: string | Types.ObjectId): Promise<ChannelDoc> {
  const existing = await RoomChannel.findOne({ roomId, type: "general", name: "general" });
  if (existing) return existing;
  return RoomChannel.create({
    roomId,
    type: "general",
    name: "general",
    participantIds: [],
  });
}

export async function ensureDirectChannelForParticipant(room: RoomDoc, participant: ParticipantDoc): Promise<ChannelDoc | null> {
  if (!ROOM_MEMBER_STATUSES.includes(participant.status as any)) return null;
  const talentId = participantUserId(participant);
  const name = `dm:${talentId}`;
  const updates = {
    participantIds: [room.businessId, participant.userId],
    roleId: participant.roleId ?? undefined,
  };
  const existing = await RoomChannel.findOne({ roomId: room._id, type: "direct", name });
  if (existing) {
    existing.set(updates);
    return existing.save();
  }
  return RoomChannel.create({
    roomId: room._id,
    type: "direct",
    name,
    ...updates,
  });
}

export async function ensureInterviewChannelForParticipants({
  room,
  participants,
  title,
  roleId,
}: {
  room: RoomDoc;
  participants: ParticipantDoc[];
  title?: string;
  roleId?: string | Types.ObjectId | null;
}): Promise<ChannelDoc | null> {
  const activeParticipants = participants.filter((participant) => ROOM_INTERVIEW_ELIGIBLE_STATUSES.includes(participant.status as any));
  if (activeParticipants.length === 0) return null;
  const talentIds = [...new Set(activeParticipants.map(participantUserId))].sort();
  const channelParticipants = [String(room.businessId), ...talentIds];
  const name = `interview:${talentIds.join(":")}`;
  const updates = {
    participantIds: channelParticipants,
    roleId: roleId ?? activeParticipants[0]?.roleId ?? undefined,
  };
  const existing = await RoomChannel.findOne({ roomId: room._id, type: "interview", name });
  if (existing) {
    existing.set(updates);
    if (!existing.interviewStatus) existing.interviewStatus = "scheduled";
    if (title?.trim()) existing.name = name;
    return existing.save();
  }
  return RoomChannel.create({
    roomId: room._id,
    type: "interview",
    name,
    interviewStatus: "scheduled",
    ...updates,
  });
}

export async function ensureAIAgentChannel(room: RoomDoc): Promise<ChannelDoc> {
  const existing = await RoomChannel.findOne({ roomId: room._id, type: "ai-agent", name: "ai-agent" });
  if (existing) return existing;
  return RoomChannel.create({
    roomId: room._id,
    type: "ai-agent",
    name: "ai-agent",
    participantIds: [room.businessId],
  });
}

export async function ensureWorkspaceChannels(room: RoomDoc): Promise<void> {
  await ensureGeneralChannel(room._id);
  await ensureAIAgentChannel(room);
  const participants = await RoomParticipant.find({
    roomId: room._id,
    status: { $in: ROOM_MEMBER_STATUSES },
  });
  await Promise.all(participants.map((participant) => ensureDirectChannelForParticipant(room, participant)));
}

export async function createTalentJoinedSystemMessage(room: RoomDoc, participant: ParticipantDoc, io?: Server | null): Promise<MessageDoc | null> {
  if (!ROOM_MEMBER_STATUSES.includes(participant.status as any)) return null;
  const general = await ensureGeneralChannel(room._id);
  const [user, role] = await Promise.all([
    User.findById(participant.userId).select("name"),
    participant.roleId ? RoomRole.findById(participant.roleId) : null,
  ]);
  const talentName = user?.name ?? "Talent";
  const roleName = role?.roleTitle ?? "project collaborator";
  const message = `${talentName} joined as ${roleName}`;
  const existing = await RoomMessage.findOne({
    roomId: room._id,
    channelId: general._id,
    senderId: participant.userId,
    type: "system",
    message,
  });
  if (existing) return existing;

  const saved = await RoomMessage.create({
    roomId: room._id,
    channelId: general._id,
    senderId: participant.userId,
    senderName: "System",
    type: "system",
    message,
    mentions: [],
  });
  io?.to(`room:${room._id}`).emit("room:message_created", formatRoomMessage(saved));
  return saved;
}

export async function userCanAccessChannel(room: RoomDoc, channel: ChannelDoc, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  if (isRoomOwner(room, userId)) return true;
  const participant = await getActiveParticipant(room._id, userId);
  if (!participant) return false;
  if (channel.type === "general") return true;
  return channel.participantIds.map(String).includes(userId);
}

export async function getVisibleChannels(room: RoomDoc, userId: string): Promise<ChannelDoc[]> {
  await ensureWorkspaceChannels(room);
  const channels = await RoomChannel.find({ roomId: room._id }).sort({ type: 1, createdAt: 1 });
  if (isRoomOwner(room, userId)) return channels;
  const participant = await getActiveParticipant(room._id, userId);
  if (!participant) return [];
  return channels.filter((channel) => channel.type === "general" || channel.participantIds.map(String).includes(userId));
}

export async function userCanViewRoomDocument(room: RoomDoc, userId: string | undefined, docType: string): Promise<boolean> {
  if (!userId) return false;
  if (isRoomOwner(room, userId)) return true;
  const participant = await getActiveParticipant(room._id, userId);
  if (!participant) return false;
  const permission = await RoomDocumentPermission.findOne({
    roomId: room._id,
    talentId: userId,
    docType,
    canView: true,
  });
  return Boolean(permission);
}

export async function getRoomDocumentCatalog(room: RoomDoc, userId: string) {
  const isOwner = isRoomOwner(room, userId);
  const [generatedDocs, permissions] = await Promise.all([
    GeneratedDoc.find({ roomId: room._id }).sort({ createdAt: -1 }),
    RoomDocumentPermission.find({ roomId: room._id }),
  ]);
  const allowedDocTypes = new Set(
    permissions
      .filter((permission) => String(permission.talentId) === userId && permission.canView)
      .map((permission) => permission.docType)
  );
  const standardDocs = STANDARD_ROOM_DOCUMENTS.map((doc) => ({
    ...doc,
    documentId: null,
    canView: isOwner || allowedDocTypes.has(doc.docType),
  }));
  const dynamicDocs = generatedDocs.map((doc) => ({
    docType: doc.documentType,
    title: doc.title,
    source: "generated",
    documentId: String(doc._id),
    canView: isOwner || allowedDocTypes.has(doc.documentType),
  }));
  return [...standardDocs, ...dynamicDocs].filter((doc) => isOwner || doc.canView);
}

export async function getPermissionMatrix(room: RoomDoc) {
  const [participants, roles, permissions] = await Promise.all([
    RoomParticipant.find({ roomId: room._id }).populate("userId", "name email avatarUrl"),
    RoomRole.find({ roomId: room._id }),
    RoomDocumentPermission.find({ roomId: room._id }),
  ]);
  const roleById = new Map(roles.map((role) => [String(role._id), role]));
  const permissionByTalentDoc = new Map(
    permissions.map((permission) => [`${String(permission.talentId)}:${permission.docType}`, permission])
  );
  const documents = await getRoomDocumentCatalog(room, String(room.businessId));
  return participants.map((participant: any) => {
    const user = participant.userId;
    const role = participant.roleId ? roleById.get(String(participant.roleId)) : null;
    const talentId = String(user?._id ?? participant.userId);
    return {
      participantId: String(participant._id),
      talentId,
      name: user?.name ?? "Talent",
      email: user?.email ?? null,
      roleId: participant.roleId ?? null,
      roleTitle: role?.roleTitle ?? null,
      status: participant.status,
      documents: documents.map((doc) => {
        const permission = permissionByTalentDoc.get(`${talentId}:${doc.docType}`);
        return {
          docType: doc.docType,
          title: doc.title,
          canView: Boolean(permission?.canView),
          grantedAt: permission?.grantedAt ?? null,
          revokedAt: permission?.revokedAt ?? null,
        };
      }),
    };
  });
}

export function formatRoomChannel(channel: ChannelDoc, displayName?: string) {
  return {
    _id: channel._id,
    roomId: channel.roomId,
    type: channel.type,
    name: channel.name,
    displayName: displayName ?? (channel.type === "general" ? "general" : "Direct message"),
    participantIds: channel.participantIds,
    roleId: channel.roleId ?? null,
    interviewStatus: channel.interviewStatus ?? null,
    interviewMeetLink: channel.interviewMeetLink ?? null,
    interviewScheduledAt: channel.interviewScheduledAt ?? null,
    interviewNotes: channel.interviewNotes ?? null,
    createdAt: channel.createdAt,
  };
}

export function formatRoomMessage(message: MessageDoc) {
  return {
    _id: message._id,
    id: String(message._id),
    roomId: message.roomId,
    channelId: message.channelId,
    senderId: message.senderId ?? null,
    senderName: message.senderName,
    type: message.type,
    message: message.message,
    mentions: message.mentions ?? [],
    isAi: message.type === "ai",
    createdAt: message.createdAt,
  };
}

export function participantUserId(participant: ParticipantDoc): string {
  const value = participant.userId as any;
  return String(value?._id ?? value);
}
