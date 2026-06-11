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
  // Relaxing CORS check for demo purposes
  console.warn("Warning: CORS_ORIGINS or CLIENT_ORIGIN not set. Allowing all origins for demo.");
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
  return true;
}

export const corsOptions: CorsOptions = {
  credentials: true,
  origin: true,
};
