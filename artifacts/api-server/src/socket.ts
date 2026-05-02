import type { Server, Socket } from "socket.io";
import { logger } from "./lib/logger.js";

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

export function setupSocket(ioServer: Server): void {
  io = ioServer;

  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("room:join", (data: { roomId: string; userId?: string }) => {
      const { roomId, userId } = data;
      socket.join(`room:${roomId}`);
      if (userId) {
        socket.join(`talent:${userId}`);
      }
      socket.to(`room:${roomId}`).emit("room:participant_joined", { socketId: socket.id, roomId });
      logger.info({ socketId: socket.id, roomId }, "Joined room");
    });

    socket.on("room:leave", (data: { roomId: string }) => {
      const { roomId } = data;
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("room:participant_left", { socketId: socket.id, roomId });
    });

    socket.on("availability:toggle", (data: { userId: string; isOnline: boolean }) => {
      socket.broadcast.emit("talent:availability_changed", data);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });
}
