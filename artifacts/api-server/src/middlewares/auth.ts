import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
