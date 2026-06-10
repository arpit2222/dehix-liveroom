import type { Server, Socket } from "socket.io";
import { logger } from "./lib/logger.js";
import { verifyToken, type JwtPayload } from "./lib/jwt.js";
import { userCanAccessRoom } from "./lib/roomAccess.js";

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

export function setupSocket(ioServer: Server): void {
  io = ioServer;

  io.use((socket, next) => {
    const token = extractSocketToken(socket);
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as JwtPayload;
    socket.join(`talent:${user.userId}`);
    logger.info({ socketId: socket.id, userId: user.userId }, "Socket connected");

    socket.on("room:join", async (data: { roomId: string }) => {
      const { roomId } = data;
      if (!(await userCanAccessRoom(roomId, user.userId))) {
        socket.emit("room:error", { roomId, error: "You do not have access to this room" });
        logger.warn({ socketId: socket.id, userId: user.userId, roomId }, "Blocked socket room join");
        return;
      }
      socket.join(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("room:participant_joined", { socketId: socket.id, roomId, userId: user.userId });
      logger.info({ socketId: socket.id, userId: user.userId, roomId }, "Joined room");
    });

    socket.on("room:leave", (data: { roomId: string }) => {
      const { roomId } = data;
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("room:participant_left", { socketId: socket.id, roomId });
    });

    socket.on("availability:toggle", (data: { userId: string; isOnline: boolean }) => {
      if (data.userId !== user.userId) return;
      socket.broadcast.emit("talent:availability_changed", data);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id, userId: user.userId }, "Socket disconnected");
    });
  });
}

function extractSocketToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.["token"];
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}
