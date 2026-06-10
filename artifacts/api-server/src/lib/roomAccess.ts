import type { NextFunction, Response } from "express";
import { LiveRoom } from "../models/LiveRoom.js";
import { RoomParticipant } from "../models/RoomParticipant.js";
import type { AuthRequest } from "../middlewares/auth.js";

const MEMBER_STATUSES = ["joined", "accepted"] as const;

export async function getRoomAccess(roomId: string | undefined, userId: string | undefined) {
  if (!roomId || !userId) return null;

  const room = await LiveRoom.findById(roomId);
  if (!room) return null;

  const isOwner = String(room.businessId) === userId;
  const isParticipant = Boolean(
    await RoomParticipant.exists({
      roomId: room._id,
      userId,
      status: { $in: MEMBER_STATUSES },
    })
  );

  return { room, isOwner, isParticipant, hasAccess: isOwner || isParticipant };
}

export async function userCanAccessRoom(roomId: string | undefined, userId: string | undefined): Promise<boolean> {
  const access = await getRoomAccess(roomId, userId);
  return Boolean(access?.hasAccess);
}

export async function userOwnsRoom(roomId: string | undefined, userId: string | undefined): Promise<boolean> {
  const access = await getRoomAccess(roomId, userId);
  return Boolean(access?.isOwner);
}

export async function requireRoomAccess(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const access = await getRoomAccess(getRouteParam(req, "id"), req.userId);
    if (!access) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (!access.hasAccess) {
      res.status(403).json({ error: "You do not have access to this room" });
      return;
    }
    res.locals["room"] = access.room;
    res.locals["roomAccess"] = access;
    next();
  } catch (err) {
    req.log.error({ err }, "room access check failed");
    res.status(500).json({ error: "Failed to verify room access" });
  }
}

export async function requireRoomOwner(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const access = await getRoomAccess(getRouteParam(req, "id"), req.userId);
    if (!access) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (!access.isOwner) {
      res.status(403).json({ error: "Only the room owner can perform this action" });
      return;
    }
    res.locals["room"] = access.room;
    res.locals["roomAccess"] = access;
    next();
  } catch (err) {
    req.log.error({ err }, "room owner check failed");
    res.status(500).json({ error: "Failed to verify room ownership" });
  }
}

export function getAuthedRoom(res: Response): InstanceType<typeof LiveRoom> | null {
  return (res.locals["room"] as InstanceType<typeof LiveRoom> | undefined) ?? null;
}

function getRouteParam(req: AuthRequest, name: string): string | undefined {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}
