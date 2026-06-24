import mongoose from "mongoose";
import { connectMongoDB } from "../lib/mongodb.js";
import {
  asDehixId,
  dehixCollectionForRole,
  mapMilestoneStatusToDehix,
  mapRoomStatusToDehixProjectStatus,
  toDehixRole,
  type DehixSyncMetadata,
} from "../lib/dehixSync.js";
import { User } from "../models/User.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { RoomChannel } from "../models/RoomChannel.js";
import { RoomMessage } from "../models/RoomMessage.js";
import { RoomDocumentPermission } from "../models/RoomDocumentPermission.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { FreelancerMatch } from "../models/FreelancerMatch.js";
import { ProjectShortlist } from "../models/ProjectShortlist.js";
import { ProjectEnquiry } from "../models/ProjectEnquiry.js";
import { ProjectEnquiryRecipient } from "../models/ProjectEnquiryRecipient.js";
import { SbtCredential } from "../models/SbtCredential.js";
import { Notification } from "../models/Notification.js";
import { Milestone } from "../models/Milestone.js";
import { Ticket } from "../models/Ticket.js";
import { Nda } from "../models/Nda.js";
import { GeneratedDoc } from "../models/GeneratedDoc.js";
import { LaunchSession } from "../models/LaunchSession.js";
import { LaunchClarification } from "../models/LaunchClarification.js";
import { AiChatMessage } from "../models/AiChatMessage.js";

type MutableDoc = mongoose.Document & { dehix?: DehixSyncMetadata; [key: string]: any };
type SyncStats = Record<string, { scanned: number; updated: number }>;

function ensureStats(stats: SyncStats, label: string) {
  stats[label] ??= { scanned: 0, updated: 0 };
  return stats[label];
}

function writeDehix(doc: MutableDoc, values: DehixSyncMetadata): boolean {
  const rawDehix = doc.dehix as (DehixSyncMetadata & { toObject?: () => DehixSyncMetadata }) | undefined;
  const existingDehix = rawDehix?.toObject ? rawDehix.toObject() : rawDehix;
  const dehix: DehixSyncMetadata = { syncStatus: "local_only", ...(existingDehix ?? {}) };
  let changed = false;

  for (const [key, value] of Object.entries(values) as Array<[keyof DehixSyncMetadata, unknown]>) {
    if (value === undefined || value === null || value === "") continue;
    const current = dehix[key];
    const isEqual = Array.isArray(current) || Array.isArray(value)
      ? JSON.stringify(current ?? []) === JSON.stringify(value ?? [])
      : current === value;
    if (!isEqual) {
      (dehix as Record<string, unknown>)[key] = value;
      changed = true;
    }
  }

  if (changed || !doc.dehix) {
    doc.dehix = dehix;
    doc.markModified("dehix");
    return true;
  }

  return false;
}

async function saveIfChanged(label: string, stats: SyncStats, doc: MutableDoc, changed: boolean) {
  const stat = ensureStats(stats, label);
  stat.scanned += 1;
  if (!changed) return;
  await doc.save();
  stat.updated += 1;
}

function id(value: unknown): string | undefined {
  return asDehixId(value);
}

function participantStatus(status: unknown): string | undefined {
  switch (status) {
    case "invited":
      return "INVITED";
    case "joined":
      return "LOBBY";
    case "accepted":
      return "SELECTED";
    case "declined":
      return "REJECTED";
    default:
      return undefined;
  }
}

async function main() {
  await connectMongoDB();
  const stats: SyncStats = {};

  const users = await User.find();
  const userSync = new Map<string, DehixSyncMetadata>();
  for (const user of users as MutableDoc[]) {
    const role = toDehixRole(user.role);
    const changed = writeDehix(user, {
      userId: id(user._id),
      role,
      sourceCollection: dehixCollectionForRole(user.role),
      syncStatus: user.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_users", stats, user, changed);
    userSync.set(String(user._id), user.dehix ?? {});
  }

  const rooms = await LiveRoom.find();
  const roomSync = new Map<string, DehixSyncMetadata>();
  const launchSessionToRoom = new Map<string, DehixSyncMetadata>();
  for (const room of rooms as MutableDoc[]) {
    const business = userSync.get(String(room.businessId));
    const projectId = room.dehix?.projectId ?? id(room._id);
    const values: DehixSyncMetadata = {
      businessId: business?.businessId ?? business?.userId ?? id(room.businessId),
      projectId,
      status: mapRoomStatusToDehixProjectStatus(room.status),
      sourceCollection: "projects",
      syncStatus: room.dehix?.syncStatus ?? "local_only",
    };
    const changed = writeDehix(room, values);
    await saveIfChanged("dl_live_rooms", stats, room, changed);
    roomSync.set(String(room._id), room.dehix ?? values);
    if (room.launchSessionId) launchSessionToRoom.set(String(room.launchSessionId), room.dehix ?? values);
  }

  const roles = await RoomRole.find();
  const roleSync = new Map<string, DehixSyncMetadata>();
  for (const role of roles as MutableDoc[]) {
    const room = roomSync.get(String(role.roomId));
    const filledBy = userSync.get(String(role.filledBy));
    const values: DehixSyncMetadata = {
      projectId: room?.projectId,
      businessId: room?.businessId,
      projectProfileId: role.dehix?.projectProfileId ?? id(role._id),
      freelancerId: filledBy?.freelancerId ?? filledBy?.userId ?? id(role.filledBy),
      sourceCollection: "projects.profiles",
      syncStatus: role.dehix?.syncStatus ?? "local_only",
    };
    const changed = writeDehix(role, values);
    await saveIfChanged("dl_room_roles", stats, role, changed);
    roleSync.set(String(role._id), role.dehix ?? values);
  }

  const roomMilestoneNumbers = new Map<string, Map<number, DehixSyncMetadata>>();
  const milestones = await Milestone.find().sort({ createdAt: 1 });
  for (const milestone of milestones as MutableDoc[]) {
    const room = roomSync.get(String(milestone.roomId));
    const sameRoom = roomMilestoneNumbers.get(String(milestone.roomId)) ?? new Map<number, DehixSyncMetadata>();
    const number = sameRoom.size + 1;
    const values: DehixSyncMetadata = {
      projectId: room?.projectId,
      businessId: room?.businessId,
      milestoneId: milestone.dehix?.milestoneId ?? id(milestone._id),
      status: mapMilestoneStatusToDehix(milestone.status),
      sourceCollection: "milestones",
      syncStatus: milestone.dehix?.syncStatus ?? "local_only",
    };
    const changed = writeDehix(milestone, values);
    await saveIfChanged("dl_milestones", stats, milestone, changed);
    sameRoom.set(number, milestone.dehix ?? values);
    roomMilestoneNumbers.set(String(milestone.roomId), sameRoom);
  }

  const participants = await RoomParticipant.find();
  for (const participant of participants as MutableDoc[]) {
    const room = roomSync.get(String(participant.roomId));
    const user = userSync.get(String(participant.userId));
    const role = roleSync.get(String(participant.roleId));
    const values: DehixSyncMetadata = {
      projectId: room?.projectId,
      businessId: room?.businessId,
      freelancerId: user?.freelancerId ?? user?.userId ?? id(participant.userId),
      projectProfileId: role?.projectProfileId ?? id(participant.roleId),
      projectInviteId: participant.dehix?.projectInviteId ?? id(participant._id),
      status: participantStatus(participant.status),
      sourceCollection: "projectinvites",
      syncStatus: participant.dehix?.syncStatus ?? "local_only",
    };
    const changed = writeDehix(participant, values);
    await saveIfChanged("dl_room_participants", stats, participant, changed);
  }

  for (const ticket of await Ticket.find() as MutableDoc[]) {
    const room = roomSync.get(String(ticket.roomId));
    const role = roleSync.get(String(ticket.assignedRole));
    const milestone = roomMilestoneNumbers.get(String(ticket.roomId))?.get(Number(ticket.milestoneNumber ?? 1));
    const changed = writeDehix(ticket, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      projectProfileId: role?.projectProfileId ?? id(ticket.assignedRole),
      milestoneId: milestone?.milestoneId,
      taskId: ticket.dehix?.taskId ?? id(ticket._id),
      status: mapMilestoneStatusToDehix(ticket.status),
      sourceCollection: "milestones.stories.tasks",
      syncStatus: ticket.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_tickets", stats, ticket, changed);
  }

  for (const credential of await SbtCredential.find() as MutableDoc[]) {
    const user = userSync.get(String(credential.userId));
    const changed = writeDehix(credential, {
      freelancerId: user?.freelancerId ?? user?.userId ?? id(credential.userId),
      verificationId: credential.dehix?.verificationId ?? id(credential._id),
      status: credential.status === "verified" ? "VERIFIED" : credential.status === "revoked" ? "REJECTED" : "PENDING",
      sourceCollection: "freelancers.attributes",
      syncStatus: credential.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_sbt_credentials", stats, credential, changed);
  }

  for (const match of await FreelancerMatch.find() as MutableDoc[]) {
    const room = roomSync.get(String(match.roomId));
    const role = roleSync.get(String(match.roleId));
    const user = userSync.get(String(match.freelancerId));
    const changed = writeDehix(match, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      projectProfileId: role?.projectProfileId ?? id(match.roleId),
      freelancerId: user?.freelancerId ?? user?.userId ?? id(match.freelancerId),
      sourceCollection: "freelancerprofiles",
      syncStatus: match.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_freelancer_matches", stats, match, changed);
  }

  for (const shortlist of await ProjectShortlist.find() as MutableDoc[]) {
    const room = roomSync.get(String(shortlist.roomId));
    const role = roleSync.get(String(shortlist.roleId));
    const business = userSync.get(String(shortlist.businessId));
    const freelancer = userSync.get(String(shortlist.freelancerId));
    const changed = writeDehix(shortlist, {
      projectId: room?.projectId,
      businessId: business?.businessId ?? business?.userId ?? room?.businessId ?? id(shortlist.businessId),
      projectProfileId: role?.projectProfileId ?? id(shortlist.roleId),
      freelancerId: freelancer?.freelancerId ?? freelancer?.userId ?? id(shortlist.freelancerId),
      hireId: shortlist.status === "hired" ? shortlist.dehix?.hireId ?? id(shortlist._id) : shortlist.dehix?.hireId,
      sourceCollection: shortlist.status === "hired" ? "hires" : "projectinvites",
      syncStatus: shortlist.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_project_shortlists", stats, shortlist, changed);
  }

  for (const enquiry of await ProjectEnquiry.find() as MutableDoc[]) {
    const room = roomSync.get(String(enquiry.roomId));
    const business = userSync.get(String(enquiry.businessId));
    const changed = writeDehix(enquiry, {
      projectId: room?.projectId,
      businessId: business?.businessId ?? business?.userId ?? room?.businessId ?? id(enquiry.businessId),
      sourceCollection: "projectinvites",
      syncStatus: enquiry.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_project_enquiries", stats, enquiry, changed);
  }

  for (const recipient of await ProjectEnquiryRecipient.find() as MutableDoc[]) {
    const room = roomSync.get(String(recipient.roomId));
    const role = roleSync.get(String(recipient.roleId));
    const freelancer = userSync.get(String(recipient.freelancerId));
    const changed = writeDehix(recipient, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      projectProfileId: role?.projectProfileId ?? id(recipient.roleId),
      freelancerId: freelancer?.freelancerId ?? freelancer?.userId ?? id(recipient.freelancerId),
      projectInviteId: recipient.dehix?.projectInviteId ?? id(recipient._id),
      sourceCollection: "projectinvites",
      syncStatus: recipient.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_project_enquiry_recipients", stats, recipient, changed);
  }

  for (const channel of await RoomChannel.find() as MutableDoc[]) {
    const room = roomSync.get(String(channel.roomId));
    const role = roleSync.get(String(channel.roleId));
    const participantIds = (channel.participantIds ?? []).map((participantId: unknown) => {
      const user = userSync.get(String(participantId));
      return user?.userId ?? id(participantId);
    }).filter(Boolean);
    const changed = writeDehix(channel, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      projectProfileId: role?.projectProfileId ?? id(channel.roleId),
      interviewId: channel.type === "interview" ? channel.dehix?.interviewId ?? id(channel._id) : channel.dehix?.interviewId,
      sourceCollection: channel.type === "interview" ? "interviews" : "live_room_channels",
      syncStatus: channel.dehix?.syncStatus ?? "local_only",
    });
    if (participantIds.length > 0 && JSON.stringify(channel.dehix?.participantIds) !== JSON.stringify(participantIds)) {
      channel.dehix = { ...(channel.dehix ?? {}), participantIds };
      channel.markModified("dehix");
      await saveIfChanged("dl_room_channels", stats, channel, true);
    } else {
      await saveIfChanged("dl_room_channels", stats, channel, changed);
    }
  }

  for (const message of await RoomMessage.find() as MutableDoc[]) {
    const room = roomSync.get(String(message.roomId));
    const user = userSync.get(String(message.senderId));
    const changed = writeDehix(message, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      userId: user?.userId ?? id(message.senderId),
      entityId: id(message.channelId),
      sourceCollection: "live_room_messages",
      syncStatus: message.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_room_messages", stats, message, changed);
  }

  for (const permission of await RoomDocumentPermission.find() as MutableDoc[]) {
    const room = roomSync.get(String(permission.roomId));
    const talent = userSync.get(String(permission.talentId));
    const grantedBy = userSync.get(String(permission.grantedBy));
    const changed = writeDehix(permission, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      freelancerId: talent?.freelancerId ?? talent?.userId ?? id(permission.talentId),
      userId: grantedBy?.userId ?? id(permission.grantedBy),
      entityId: permission.docType,
      sourceCollection: "live_room_document_permissions",
      syncStatus: permission.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_room_document_permissions", stats, permission, changed);
  }

  for (const activity of await RoomActivity.find() as MutableDoc[]) {
    const room = roomSync.get(String(activity.roomId));
    const actor = userSync.get(String(activity.actorId));
    const changed = writeDehix(activity, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      userId: actor?.userId ?? id(activity.actorId),
      sourceCollection: "live_room_activity",
      syncStatus: activity.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_room_activity", stats, activity, changed);
  }

  for (const nda of await Nda.find() as MutableDoc[]) {
    const room = roomSync.get(String(nda.roomId));
    const changed = writeDehix(nda, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      verificationId: nda.dehix?.verificationId ?? id(nda._id),
      status: nda.status === "signed" ? "VERIFIED" : "PENDING",
      sourceCollection: "verifications",
      syncStatus: nda.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_ndas", stats, nda, changed);
  }

  for (const doc of await GeneratedDoc.find() as MutableDoc[]) {
    const room = roomSync.get(String(doc.roomId));
    const changed = writeDehix(doc, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      reportId: doc.dehix?.reportId ?? id(doc._id),
      userId: doc.createdBy,
      sourceCollection: "reports",
      syncStatus: doc.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_generated_docs", stats, doc, changed);
  }

  for (const session of await LaunchSession.find() as MutableDoc[]) {
    const user = userSync.get(String(session.userId));
    const room = launchSessionToRoom.get(String(session._id));
    const changed = writeDehix(session, {
      userId: user?.userId ?? id(session.userId),
      businessId: user?.businessId ?? user?.userId ?? id(session.userId),
      projectId: room?.projectId,
      sourceCollection: "projects",
      syncStatus: session.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_launch_sessions", stats, session, changed);
  }

  const sessionSync = new Map((await LaunchSession.find()).map((session: any) => [String(session._id), session.dehix ?? {}]));
  for (const clarification of await LaunchClarification.find() as MutableDoc[]) {
    const session = sessionSync.get(String(clarification.sessionId));
    const changed = writeDehix(clarification, {
      projectId: session?.projectId,
      businessId: session?.businessId,
      entityId: id(clarification.sessionId),
      sourceCollection: "projects",
      syncStatus: clarification.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_launch_clarifications", stats, clarification, changed);
  }

  for (const message of await AiChatMessage.find() as MutableDoc[]) {
    const room = roomSync.get(String(message.roomId));
    const session = sessionSync.get(String(message.launchSessionId));
    const user = userSync.get(String(message.userId));
    const changed = writeDehix(message, {
      projectId: room?.projectId ?? session?.projectId,
      businessId: room?.businessId ?? session?.businessId,
      userId: user?.userId ?? id(message.userId),
      entityId: message.threadId,
      sourceCollection: "notes",
      syncStatus: message.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_ai_chat_messages", stats, message, changed);
  }

  for (const notification of await Notification.find() as MutableDoc[]) {
    const room = roomSync.get(String(notification.roomId));
    const user = userSync.get(String(notification.userId));
    const changed = writeDehix(notification, {
      projectId: room?.projectId,
      businessId: room?.businessId,
      userId: user?.userId ?? id(notification.userId),
      notificationId: notification.dehix?.notificationId ?? id(notification._id),
      entityId: id(notification.enquiryRecipientId) ?? id(notification.roomId),
      sourceCollection: "usernotifications",
      syncStatus: notification.dehix?.syncStatus ?? "local_only",
    });
    await saveIfChanged("dl_notifications", stats, notification, changed);
  }

  console.table(stats);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
