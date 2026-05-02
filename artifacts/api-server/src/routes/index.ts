import { Router } from "express";
import { Ticket } from "../models/Ticket.js";
import { Nda } from "../models/Nda.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { UpdateTicketBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

import healthRouter from "./health.js";
import authRouter from "./auth.js";
import roomsRouter from "./rooms.js";
import aiRouter from "./ai.js";
import talentRouter from "./talent.js";
import ticketsSubRouter from "./tickets.js";
import milestonesSubRouter from "./milestones.js";
import ndaSubRouter from "./nda.js";

const router = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/rooms", roomsRouter);
router.use("/ai", aiRouter);
router.use("/talent", talentRouter);
router.use("/rooms/:id/tickets", ticketsSubRouter);
router.use("/rooms/:id/milestones", milestonesSubRouter);
router.use("/rooms/:id/nda", ndaSubRouter);

router.put("/tickets/:id", requireAuth, async (req: AuthRequest, res) => {
  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const ticket = await Ticket.findByIdAndUpdate(req.params["id"], parsed.data, { new: true });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const io = getIo();
    if (io) {
      io.to(`room:${ticket.roomId}`).emit("room:ticket_updated", {
        _id: ticket._id,
        roomId: ticket.roomId,
        title: ticket.title,
        description: ticket.description ?? null,
        assignedRole: ticket.assignedRole ?? null,
        milestoneNumber: ticket.milestoneNumber,
        estimatedHours: ticket.estimatedHours ?? null,
        status: ticket.status,
        createdAt: ticket.createdAt,
      });
    }
    res.json({
      _id: ticket._id,
      roomId: ticket.roomId,
      title: ticket.title,
      description: ticket.description ?? null,
      assignedRole: ticket.assignedRole ?? null,
      milestoneNumber: ticket.milestoneNumber,
      estimatedHours: ticket.estimatedHours ?? null,
      status: ticket.status,
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

export default router;
