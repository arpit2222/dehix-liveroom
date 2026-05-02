import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router = Router();

function safeUser(user: InstanceType<typeof User>) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    walletAddress: user.walletAddress ?? null,
    isOnline: user.isOnline,
    createdAt: user.createdAt,
  };
}

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password, name, role, walletAddress } = parsed.data;
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed, name, role, walletAddress });
    const token = signToken({ userId: String(user._id), role: user.role, email: user.email });
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    req.log.error({ err }, "register error");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    await User.findByIdAndUpdate(user._id, { isOnline: true, lastSeen: new Date() });
    const token = signToken({ userId: String(user._id), role: user.role, email: user.email });
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    req.log.error({ err }, "login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { isOnline: false, lastSeen: new Date() });
    res.json({ message: "Logged out" });
  } catch {
    res.json({ message: "Logged out" });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json(safeUser(user));
  } catch (err) {
    req.log.error({ err }, "getMe error");
    res.status(500).json({ error: "Failed to get user" });
  }
});

export default router;
