import jwt from "jsonwebtoken";

const isProduction = process.env["NODE_ENV"] === "production";
const configuredSecret = process.env["SESSION_SECRET"];

if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
}

const SECRET = configuredSecret ?? "dev-only-change-me-session-secret";

export interface JwtPayload {
  userId: string;
  role: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
