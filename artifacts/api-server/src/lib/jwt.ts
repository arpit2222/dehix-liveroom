import jwt from "jsonwebtoken";

const SECRET = process.env["SESSION_SECRET"] ?? "dehix-secret-fallback";

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
