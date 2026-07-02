import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { type Options as RateLimitOptions } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { corsOptions } from "./lib/cors.js";

const app: Express = express();
const isProduction = process.env["NODE_ENV"] === "production";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  logger.warn({ name, value: raw, fallback }, "Invalid numeric environment variable; using fallback");
  return fallback;
}

function getTrustProxySetting(): false | number {
  const raw = process.env["TRUST_PROXY"];
  if (!raw) return isProduction ? 1 : false;

  const normalized = raw.trim().toLowerCase();
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  if (["true", "1", "on", "yes"].includes(normalized)) return 1;

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  const fallback = isProduction ? 1 : false;
  logger.warn({ value: raw, fallback }, "Invalid TRUST_PROXY value; using fallback");
  return fallback;
}

function rateLimitHandler(label: string) {
  return (_req: Request, res: Response, _next: NextFunction, options: RateLimitOptions) => {
    const retryAfterHeader = res.getHeader("Retry-After");
    const retryAfterSeconds =
      typeof retryAfterHeader === "number"
        ? retryAfterHeader
        : typeof retryAfterHeader === "string"
          ? Number.parseInt(retryAfterHeader, 10)
          : Math.ceil(options.windowMs / 1000);

    res.status(options.statusCode).json({
      error: `${label} rate limit exceeded`,
      message: "Too many requests. Please try again later.",
      retryAfterSeconds: Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : Math.ceil(options.windowMs / 1000),
    });
  };
}

const trustProxy = getTrustProxySetting();
if (trustProxy !== false) {
  app.set("trust proxy", trustProxy);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: getPositiveIntEnv("API_RATE_LIMIT", 600),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("API"),
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: getPositiveIntEnv("AUTH_RATE_LIMIT", 300),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler("Authentication"),
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use(express.json({ limit: process.env["JSON_BODY_LIMIT"] ?? "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    service: "DEHIX Live Room API",
    status: "ok",
    health: "/api/healthz",
  });
});

app.use("/api", router);

export default app;
