import { Router } from "express";
import { User } from "../models/User.js";
import { SbtCredential } from "../models/SbtCredential.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomRole } from "../models/RoomRole.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { UpdateAvailabilityBody, RespondInviteBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router();

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

router.post("/respond-invite", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RespondInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { participantId, action } = parsed.data;
  try {
    const newStatus = action === "accept" ? "joined" : "declined";
    const participant = await RoomParticipant.findByIdAndUpdate(
      participantId,
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

export default router;
