import { Router } from "express";
import { Milestone } from "../models/Milestone.js";
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
    const milestone = await Milestone.create({ roomId: req.params["id"], ...parsed.data });
    const io = getIo();
    if (io) {
      io.to(`room:${req.params["id"]}`).emit("room:milestone_updated", formatMilestone(milestone));
    }
    res.status(201).json(formatMilestone(milestone));
  } catch (err) {
    res.status(500).json({ error: "Failed to create milestone" });
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
  };
}

export default router;
