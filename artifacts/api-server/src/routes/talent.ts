import { Router } from "express";
import { User } from "../models/User.js";
import { SbtCredential } from "../models/SbtCredential.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { Milestone } from "../models/Milestone.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { ProjectEnquiry } from "../models/ProjectEnquiry.js";
import { ProjectEnquiryRecipient } from "../models/ProjectEnquiryRecipient.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { UpdateAvailabilityBody, RespondInviteBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router();

router.get("/search", async (req, res) => {
  try {
    const { skill, minRep = "0", onlineOnly = "false", limit = "20" } = req.query as Record<string, string>;
    const credFilter: Record<string, any> = { status: "verified" };
    if (skill) credFilter.skillDomain = new RegExp(skill, "i");
    const repNum = parseInt(minRep, 10) || 0;
    if (repNum > 0) credFilter.reputationScore = { $gte: repNum };

    const creds = await SbtCredential.find(credFilter)
      .populate("userId", "-password")
      .sort({ reputationScore: -1 })
      .limit(parseInt(limit, 10) || 20);

    const seen = new Set<string>();
    const results: any[] = [];
    for (const c of creds) {
      const user = c.userId as any;
      if (!user || seen.has(String(user._id))) continue;
      if (onlineOnly === "true" && !user.isOnline) continue;
      seen.add(String(user._id));
      const allCreds = await SbtCredential.find({ userId: user._id, status: "verified" });
      const overallRep = allCreds.length > 0
        ? Math.round(allCreds.reduce((s, x) => s + x.reputationScore, 0) / allCreds.length)
        : c.reputationScore;
      results.push({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl ?? null,
          walletAddress: user.walletAddress ?? null,
          isOnline: user.isOnline,
          availability: user.availability ?? "unknown",
          availabilityRank: talentAvailabilityRank(user),
          hourlyRate: user.hourlyRate ?? null,
          weeklyRate: user.weeklyRate ?? null,
          monthlyRate: user.monthlyRate ?? null,
          rating: user.rating ?? null,
          completedProjects: user.completedProjects ?? null,
          location: user.location ?? null,
          createdAt: user.createdAt,
        },
        overallReputation: overallRep,
        credentials: allCreds.map(formatCred),
        primarySkill: c.skillDomain,
      });
    }
    results.sort((a, b) => {
      const availabilityDiff = Number(b.user.availabilityRank ?? 0) - Number(a.user.availabilityRank ?? 0);
      if (availabilityDiff !== 0) return availabilityDiff;
      return Number(b.overallReputation ?? 0) - Number(a.overallReputation ?? 0);
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Talent search failed" });
  }
});

router.get("/profile/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params["id"]).select("-password");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const credentials = await SbtCredential.find({ userId: user._id });
    const overallReputation =
      credentials.length > 0
        ? Math.round(credentials.reduce((sum, c) => sum + c.reputationScore, 0) / credentials.length)
        : 0;
    res.json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
        walletAddress: user.walletAddress ?? null,
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
      credentials: credentials.map(formatCred),
      overallReputation,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get profile" });
  }
});

router.get("/credentials/:id", async (req, res) => {
  try {
    const credentials = await SbtCredential.find({ userId: req.params["id"] });
    res.json(credentials.map(formatCred));
  } catch (err) {
    res.status(500).json({ error: "Failed to get credentials" });
  }
});

router.put("/availability", requireAuth, async (req: AuthRequest, res) => {
  const parsed = UpdateAvailabilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { isOnline } = parsed.data;
  try {
    await User.findByIdAndUpdate(req.userId, { isOnline, lastSeen: new Date() });
    const io = getIo();
    if (io) {
      io.emit("talent:availability_changed", { userId: req.userId, isOnline });
    }
    res.json({ message: `Availability set to ${isOnline ? "online" : "offline"}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update availability" });
  }
});

router.get("/invites", requireAuth, async (req: AuthRequest, res) => {
  try {
    const participants = await RoomParticipant.find({
      userId: req.userId,
      status: "invited",
    });
    const results = await Promise.all(
      participants.map(async (p) => {
        const room = await LiveRoom.findById(p.roomId);
        const role = p.roleId ? await RoomRole.findById(p.roleId) : null;
        return {
          _id: p._id,
          roomId: p.roomId,
          room: room
            ? {
                _id: room._id,
                roomCode: room.roomCode,
                title: room.title,
                rawDescription: room.rawDescription,
                status: room.status,
                meetLink: room.meetLink ?? null,
                businessId: room.businessId,
                createdAt: room.createdAt,
                contractedAt: room.contractedAt ?? null,
              }
            : null,
          roleId: p.roleId ?? null,
          role: role
            ? {
                _id: role._id,
                roleTitle: role.roleTitle,
                skillDomain: role.skillDomain,
                requiredLevel: role.requiredLevel,
                minReputation: role.minReputation,
                filledBy: role.filledBy ?? null,
                status: role.status,
              }
            : null,
          status: p.status,
          joinedAt: p.joinedAt,
        };
      })
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to get invites" });
  }
});

router.get("/rooms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const participants = await RoomParticipant.find({
      userId: req.userId,
      status: "joined",
    });
    const results = await Promise.all(
      participants.map(async (p) => {
        const [room, role, milestones] = await Promise.all([
          LiveRoom.findById(p.roomId),
          p.roleId ? RoomRole.findById(p.roleId) : null,
          Milestone.find({ roomId: p.roomId }),
        ]);
        const releasedUsd = milestones.filter((m) => m.status === "released").reduce((s, m) => s + (m.amountUsd ?? 0), 0);
        const totalUsd = milestones.reduce((s, m) => s + (m.amountUsd ?? 0), 0);
        return {
          participantId: p._id,
          roomId: p.roomId,
          joinedAt: p.joinedAt,
          milestoneStats: { total: milestones.length, totalUsd, releasedUsd },
          room: room
            ? {
                _id: room._id,
                roomCode: room.roomCode,
                title: room.title,
                rawDescription: room.rawDescription,
                status: room.status,
                meetLink: room.meetLink ?? null,
                contractedAt: room.contractedAt ?? null,
                businessId: room.businessId,
                createdAt: room.createdAt,
              }
            : null,
          role: role
            ? {
                _id: role._id,
                roleTitle: role.roleTitle,
                skillDomain: role.skillDomain,
              }
            : null,
        };
      })
    );
    res.json(results.filter((r) => r.room !== null));
  } catch (err) {
    res.status(500).json({ error: "Failed to get talent rooms" });
  }
});

router.get("/enquiries", requireAuth, async (req: AuthRequest, res) => {
  try {
    const recipients = await ProjectEnquiryRecipient.find({ freelancerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    const roomIds = [...new Set(recipients.map((recipient) => String(recipient.roomId)))];
    const roleIds = [...new Set(recipients.map((recipient) => recipient.roleId ? String(recipient.roleId) : "").filter(Boolean))];
    const enquiryIds = [...new Set(recipients.map((recipient) => String(recipient.enquiryId)))];
    const [rooms, roles, enquiries] = await Promise.all([
      LiveRoom.find({ _id: { $in: roomIds } }),
      RoomRole.find({ _id: { $in: roleIds } }),
      ProjectEnquiry.find({ _id: { $in: enquiryIds } }),
    ]);
    const roomById = new Map(rooms.map((room) => [String(room._id), room]));
    const roleById = new Map(roles.map((role) => [String(role._id), role]));
    const enquiryById = new Map(enquiries.map((enquiry) => [String(enquiry._id), enquiry]));

    res.json(recipients.map((recipient) => {
      const room = roomById.get(String(recipient.roomId));
      const role = recipient.roleId ? roleById.get(String(recipient.roleId)) : null;
      const enquiry = enquiryById.get(String(recipient.enquiryId));
      return {
        _id: recipient._id,
        enquiryId: recipient.enquiryId,
        roomId: recipient.roomId,
        room: room
          ? {
              _id: room._id,
              roomCode: room.roomCode,
              title: room.title,
              rawDescription: room.rawDescription,
              status: room.status,
              meetLink: room.meetLink ?? null,
              businessId: room.businessId,
              createdAt: room.createdAt,
            }
          : null,
        roleId: recipient.roleId ?? null,
        role: role
          ? {
              _id: role._id,
              roleTitle: role.roleTitle,
              skillDomain: role.skillDomain,
              requiredLevel: role.requiredLevel,
              minReputation: role.minReputation,
              status: role.status,
            }
          : {
              _id: recipient.roleId ?? null,
              roleTitle: recipient.role,
              skillDomain: recipient.role,
            },
        message: enquiry?.message ?? null,
        matchScore: recipient.matchScore ?? null,
        matchedSkills: recipient.matchedSkills ?? [],
        presenceStatusAtSend: recipient.presenceStatusAtSend,
        emailStatus: recipient.emailStatus,
        notificationStatus: recipient.notificationStatus,
        responseStatus: recipient.responseStatus,
        responseMessage: recipient.responseMessage ?? null,
        sentAt: recipient.createdAt,
        respondedAt: recipient.respondedAt ?? null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: "Failed to get enquiries" });
  }
});

router.post("/respond-invite", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RespondInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { participantId, action } = parsed.data;
  try {
    const newStatus = action === "accept" ? "joined" : "declined";
    const participant = await RoomParticipant.findOneAndUpdate(
      { _id: participantId, userId: req.userId },
      { status: newStatus },
      { new: true }
    );
    if (!participant) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    if (action === "accept" && participant.roleId) {
      await RoomRole.findByIdAndUpdate(participant.roleId, { status: "accepted", filledBy: req.userId });
    }
    if (action === "accept") {
      RoomActivity.create({ roomId: String(participant.roomId), type: "participant_joined", actorId: req.userId }).catch(() => {});
    }
    const io = getIo();
    if (io) {
      io.to(`room:${participant.roomId}`).emit("room:participant_joined", {
        roomId: participant.roomId,
        userId: req.userId,
        status: newStatus,
      });
    }
    res.json({ message: `Invite ${action}ed` });
  } catch (err) {
    res.status(500).json({ error: "Failed to respond to invite" });
  }
});

function formatCred(c: InstanceType<typeof SbtCredential>) {
  return {
    _id: c._id,
    userId: c.userId,
    skillDomain: c.skillDomain,
    level: c.level,
    reputationScore: c.reputationScore,
    status: c.status,
    githubScore: c.githubScore,
    interviewScore: c.interviewScore,
    projectsCompleted: c.projectsCompleted,
    onChainTx: c.onChainTx ?? null,
    issuedAt: c.issuedAt,
  };
}

function talentAvailabilityRank(user: any): number {
  if (user?.isOnline && user?.availability !== "unavailable") return 4;
  switch (user?.availability) {
    case "available":
      return 3;
    case "available_soon":
    case "part_time":
      return 2;
    case "busy":
    case "unknown":
      return 1;
    default:
      return 0;
  }
}

export default router;
