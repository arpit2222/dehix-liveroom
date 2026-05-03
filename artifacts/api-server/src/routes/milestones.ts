import { Router } from "express";
import { Milestone } from "../models/Milestone.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { CreateMilestoneBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router({ mergeParams: true });

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const milestones = await Milestone.find({ roomId: req.params["id"] });
    res.json(milestones.map(formatMilestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to get milestones" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const milestone = await Milestone.create({ roomId: String(req.params["id"]), ...parsed.data });
    const io = getIo();
    if (io) {
      io.to(`room:${req.params["id"]}`).emit("room:milestone_updated", formatMilestone(milestone));
    }
    RoomActivity.create({ roomId: String(req.params["id"]), type: "milestone_created", actorId: req.userId, meta: { title: milestone.title, amountUsd: milestone.amountUsd } }).catch(() => {});
    res.status(201).json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to create milestone" });
  }
});

router.put("/:milestoneId/approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    const milestone = await Milestone.findByIdAndUpdate(
      req.params["milestoneId"],
      { status: "released" },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:milestone_updated", formatMilestone(milestone));
    RoomActivity.create({ roomId: String(req.params["id"]), type: "milestone_released", actorId: req.userId, meta: { title: milestone.title, amountUsd: milestone.amountUsd } }).catch(() => {});
    res.json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to approve milestone" });
  }
});

router.put("/:milestoneId/submit", requireAuth, async (req: AuthRequest, res) => {
  try {
    const milestone = await Milestone.findByIdAndUpdate(
      req.params["milestoneId"],
      { status: "submitted" },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:milestone_updated", formatMilestone(milestone));
    res.json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to submit milestone" });
  }
});

router.put("/:milestoneId/status", requireAuth, async (req: AuthRequest, res) => {
  const { status } = req.body;
  const allowed = ["pending", "in_progress", "completed", "released"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  try {
    const milestone = await Milestone.findByIdAndUpdate(
      req.params["milestoneId"],
      { status },
      { new: true }
    );
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    const io = getIo();
    if (io) io.to(`room:${req.params["id"]}`).emit("room:milestone_updated", formatMilestone(milestone));
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
