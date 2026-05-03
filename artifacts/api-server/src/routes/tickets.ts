import { Router } from "express";
import { Ticket } from "../models/Ticket.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { CreateTicketBody, UpdateTicketBody } from "@workspace/api-zod";
import { getIo } from "../socket.js";

const router = Router({ mergeParams: true });

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const tickets = await Ticket.find({ roomId: req.params["id"] }).sort({ createdAt: 1 });
    res.json(tickets.map(formatTicket));
  } catch (err) {
    res.status(500).json({ error: "Failed to get tickets" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const ticket = await Ticket.create({ roomId: String(req.params["id"]), ...parsed.data });
    const io = getIo();
    if (io) {
      io.to(`room:${req.params["id"]}`).emit("room:ticket_updated", formatTicket(ticket));
    }
    res.status(201).json(formatTicket(ticket));
  } catch (err) {
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export function setupTicketUpdate(router: Router) {
  router.put("/:ticketId", requireAuth, async (req: AuthRequest, res) => {
    const parsed = UpdateTicketBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    try {
      const ticket = await Ticket.findByIdAndUpdate(
        req.params["ticketId"],
        parsed.data,
        { new: true }
      );
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
      const io = getIo();
      if (io) {
        io.to(`room:${ticket.roomId}`).emit("room:ticket_updated", formatTicket(ticket));
      }
      res.json(formatTicket(ticket));
    } catch (err) {
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });
}

function formatTicket(t: InstanceType<typeof Ticket>) {
  return {
    _id: t._id,
    roomId: t.roomId,
    title: t.title,
    description: t.description ?? null,
    assignedRole: t.assignedRole ?? null,
    milestoneNumber: t.milestoneNumber,
    estimatedHours: t.estimatedHours ?? null,
    status: t.status,
    createdAt: t.createdAt,
  };
}

export default router;
