import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectMongoDB } from "./lib/mongodb.js";
import { isAllowedOrigin } from "./lib/cors.js";
import { setupSocket } from "./socket.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin is not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setupSocket(io);

connectMongoDB()
  .then(() => {
    server.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
