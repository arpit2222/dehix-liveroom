import type { CorsOptions } from "cors";

const isProduction = process.env["NODE_ENV"] === "production";

function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const configuredOrigins = [
  ...splitOrigins(process.env["CORS_ORIGINS"]),
  ...splitOrigins(process.env["CLIENT_ORIGIN"]),
];

if (isProduction && configuredOrigins.length === 0) {
  throw new Error("CORS_ORIGINS or CLIENT_ORIGIN must be set in production.");
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      !isProduction &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      ["http:", "https:"].includes(url.protocol)
    );
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, "");
  return configuredOrigins.includes(normalized) || isLocalDevelopmentOrigin(normalized);
}

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin is not allowed by CORS: ${origin}`));
  },
};
