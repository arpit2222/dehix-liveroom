import { Router } from "express";
import { Nda } from "../models/Nda.js";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomActivity } from "../models/RoomActivity.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireRoomAccess } from "../lib/roomAccess.js";
import { getIo } from "../socket.js";

const router = Router({ mergeParams: true });
router.use(requireAuth, requireRoomAccess);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const nda = await Nda.findOne({ roomId: req.params["id"] });
    if (!nda) {
      res.status(404).json({ error: "No NDA found for this room" });
      return;
    }
    res.json(formatNda(nda));
  } catch (err) {
    res.status(500).json({ error: "Failed to get NDA" });
  }
});

router.post("/sign", async (req: AuthRequest, res) => {
  try {
    const nda = await Nda.findOne({ roomId: req.params["id"] });
    if (!nda) {
      res.status(404).json({ error: "No NDA found" });
      return;
    }
    const userId = req.userId!;
    if (!nda.signedBy.includes(userId)) {
      nda.signedBy.push(userId);
    }
    const room = await LiveRoom.findById(req.params["id"]);
    const participants = nda.signedBy.length;
    if (participants >= 2) {
      nda.status = "signed";
      if (room) {
        room.status = "contracted";
        room.contractedAt = new Date();
        await room.save();
      }
      RoomActivity.create({ roomId: String(req.params["id"]), type: "nda_signed", actorId: userId, meta: { fullyExecuted: true } }).catch(() => {});
    } else {
      nda.status = "pending_signatures";
      RoomActivity.create({ roomId: String(req.params["id"]), type: "nda_signed", actorId: userId, meta: { fullyExecuted: false } }).catch(() => {});
    }
    await nda.save();
    const io = getIo();
    if (io) {
      io.to(`room:${req.params["id"]}`).emit("room:nda_signed", {
        roomId: req.params["id"],
        signedBy: nda.signedBy,
        status: nda.status,
      });
    }
    res.json(formatNda(nda));
  } catch (err) {
    res.status(500).json({ error: "Failed to sign NDA" });
  }
});

function formatNda(n: InstanceType<typeof Nda>) {
  return {
    _id: n._id,
    roomId: n.roomId,
    content: n.content,
    signedBy: n.signedBy,
    status: n.status,
    createdAt: n.createdAt,
  };
}

export default router;
