import { Router, type Response } from "express";
import { Milestone } from "../models/Milestone.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { getAuthedRoom, requireRoomAccess, requireRoomOwner } from "../lib/roomAccess.js";
import { CreateMilestoneBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router({ mergeParams: true });
router.use(requireAuth);

function ensureRoomContracted(res: Response): boolean {
  const room = getAuthedRoom(res);
  if (room?.status === "contracted") return true;
  res.status(409).json({ error: "Milestone execution unlocks after both parties sign the agreement" });
  return false;
}

function emitMilestoneUpdate(roomId: string, milestone: InstanceType<typeof Milestone>, released = false) {
  const io = getIo();
  if (!io) return;
  io.to(`room:${roomId}`).emit("room:milestone_updated", formatMilestone(milestone));
  if (released) {
    io.to(`room:${roomId}`).emit("room:milestone_released", {
      roomId,
      milestoneId: milestone._id,
      amountUsd: milestone.amountUsd ?? null,
    });
  }
}

router.get("/", requireRoomAccess, async (req: AuthRequest, res) => {
  try {
    const milestones = await Milestone.find({ roomId: req.params["id"] });
    res.json(milestones.map(formatMilestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to get milestones" });
  }
});

router.post("/", requireRoomOwner, async (req: AuthRequest, res) => {
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const milestone = await Milestone.create({ roomId: String(req.params["id"]), ...parsed.data });
    emitMilestoneUpdate(String(req.params["id"]), milestone);
    RoomActivity.create({ roomId: String(req.params["id"]), type: "milestone_created", actorId: req.userId, meta: { title: milestone.title, amountUsd: milestone.amountUsd } }).catch(() => {});
    res.status(201).json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to create milestone" });
  }
});

router.put("/:milestoneId/approve", requireRoomOwner, async (req: AuthRequest, res) => {
  if (!ensureRoomContracted(res)) return;
  try {
    const milestone = await Milestone.findOneAndUpdate(
      { _id: req.params["milestoneId"], roomId: req.params["id"] },
      { status: "released" },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    emitMilestoneUpdate(String(req.params["id"]), milestone, true);
    RoomActivity.create({ roomId: String(req.params["id"]), type: "milestone_released", actorId: req.userId, meta: { title: milestone.title, amountUsd: milestone.amountUsd } }).catch(() => {});
    res.json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to approve milestone" });
  }
});

router.put("/:milestoneId/submit", requireRoomAccess, async (req: AuthRequest, res) => {
  if (!ensureRoomContracted(res)) return;
  try {
    const milestone = await Milestone.findOneAndUpdate(
      { _id: req.params["milestoneId"], roomId: req.params["id"] },
      { status: "submitted" },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    emitMilestoneUpdate(String(req.params["id"]), milestone);
    res.json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to submit milestone" });
  }
});

router.put("/:milestoneId/status", requireRoomOwner, async (req: AuthRequest, res) => {
  const { status } = req.body;
  const allowed = ["pending", "in_progress", "completed", "released"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  if (status !== "pending" && !ensureRoomContracted(res)) return;
  try {
    const milestone = await Milestone.findOneAndUpdate(
      { _id: req.params["milestoneId"], roomId: req.params["id"] },
      { status },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    emitMilestoneUpdate(String(req.params["id"]), milestone, milestone.status === "released");
    res.json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to update milestone status" });
  }
});

function formatMilestone(m: InstanceType<typeof Milestone>) {
  return {
    _id: m._id,
    roomId: m.roomId,
    title: m.title,
    description: m.description ?? null,
    amountUsd: m.amountUsd ?? null,
    dueDate: m.dueDate ?? null,
    status: m.status,
    createdAt: (m as any).createdAt ?? null,
  };
}

export default router;
