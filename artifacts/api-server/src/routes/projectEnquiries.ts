import { Router } from "express";
import { ProjectEnquiry } from "../models/ProjectEnquiry.js";
import { ProjectEnquiryRecipient, type EnquiryResponseStatus } from "../models/ProjectEnquiryRecipient.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { getIo } from "../socket.js";

const router = Router();

const ALLOWED_RESPONSE_STATUSES = new Set<EnquiryResponseStatus>([
  "interested",
  "not_interested",
  "ask_question",
  "proposal_submitted",
]);

router.patch("/:enquiryRecipientId/respond", requireAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.body?.status as EnquiryResponseStatus;
    const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2000) : undefined;
    if (!ALLOWED_RESPONSE_STATUSES.has(status)) {
      res.status(400).json({ error: "Invalid response status" });
      return;
    }

    const recipient = await ProjectEnquiryRecipient.findOneAndUpdate(
      { _id: req.params["enquiryRecipientId"], freelancerId: req.userId },
      {
        responseStatus: status,
        responseMessage: message,
        respondedAt: new Date(),
      },
      { new: true }
    );
    if (!recipient) {
      res.status(404).json({ error: "Enquiry recipient not found" });
      return;
    }

    const enquiry = await ProjectEnquiry.findById(recipient.enquiryId);
    RoomActivity.create({
      roomId: recipient.roomId,
      type: "freelancer_enquiry_responded",
      actorId: req.userId,
      meta: { responseStatus: status, role: recipient.role },
    }).catch(() => {});

    const io = getIo();
    if (io) {
      io.to(`room:${recipient.roomId}`).emit("room:freelancer_enquiry_responded", {
        roomId: recipient.roomId,
        enquiryRecipientId: recipient._id,
        responseStatus: status,
      });
    }

    res.json({
      success: true,
      responseStatus: recipient.responseStatus,
      enquiryId: recipient.enquiryId,
      projectId: recipient.roomId,
      message: enquiry?.message ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to respond to enquiry" });
  }
});

export default router;
