import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectMongoDB } from "../lib/mongodb.js";
import { User } from "../models/User.js";

const DEMO_PASSWORD_ENV = "AUTH_DIAGNOSTIC_DEMO_PASSWORD";
const DEMO_USERS = [
  { email: "business@demo.com", name: "Nexus Protocol", role: "business" as const },
  { email: "alex@demo.com", name: "Alex Chen", role: "talent" as const },
  { email: "priya@demo.com", name: "Priya Sharma", role: "talent" as const },
  { email: "marco@demo.com", name: "Marco Rossi", role: "talent" as const },
];

interface Args {
  emails: string[];
  password?: string;
  demoPassword?: string;
  ensureDemoUsers: boolean;
  resetDemoPasswords: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    emails: [],
    ensureDemoUsers: false,
    resetDemoPasswords: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") {
      const value = argv[index + 1];
      if (!value) throw new Error("--email requires a value");
      args.emails.push(value);
      index += 1;
      continue;
    }
    if (arg === "--password") {
      const value = argv[index + 1];
      if (!value) throw new Error("--password requires a value");
      args.password = value;
      index += 1;
      continue;
    }
    if (arg === "--demo-password") {
      const value = argv[index + 1];
      if (!value) throw new Error("--demo-password requires a value");
      args.demoPassword = value;
      index += 1;
      continue;
    }
    if (arg === "--ensure-demo-users") {
      args.ensureDemoUsers = true;
      continue;
    }
    if (arg === "--reset-demo-passwords") {
      args.resetDemoPasswords = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Auth diagnostics

Usage:
  node dist/scripts/authDiagnostics.mjs --email business@demo.com
  node dist/scripts/authDiagnostics.mjs --email business@demo.com --password <account-password>
  node dist/scripts/authDiagnostics.mjs --ensure-demo-users
  node dist/scripts/authDiagnostics.mjs --ensure-demo-users --reset-demo-passwords

Notes:
  --ensure-demo-users creates missing demo users in dl_users without deleting data.
  --reset-demo-passwords also resets existing demo users to the value from --demo-password or ${DEMO_PASSWORD_ENV}.`);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function passwordFormat(password: unknown): "bcrypt" | "plain_text" | "missing" | "unknown" {
  if (typeof password !== "string" || !password) return "missing";
  if (/^\$2[aby]\$\d{2}\$/.test(password)) return "bcrypt";
  if (!password.includes("$") && password.length < 80) return "plain_text";
  return "unknown";
}

async function collectionHasEmail(collectionName: string, email: string) {
  const db = mongoose.connection.db;
  if (!db) return { collection: collectionName, exists: false };

  const doc = await db.collection(collectionName).findOne(
    { email },
    { projection: { _id: 1, email: 1, role: 1, password: 1 } },
  );

  return {
    collection: collectionName,
    exists: Boolean(doc),
    id: doc?._id?.toString(),
    role: typeof doc?.role === "string" ? doc.role : undefined,
    passwordFormat: passwordFormat(doc?.password),
  };
}

async function diagnoseEmail(rawEmail: string, password?: string) {
  const email = normalizeEmail(rawEmail);
  const user = await User.findOne({ email });

  const result: Record<string, unknown> = {
    email,
    liveRoomCollection: "dl_users",
    existsInLiveRoom: Boolean(user),
  };

  if (user) {
    result["id"] = String(user._id);
    result["role"] = user.role;
    result["accountStatus"] = user.accountStatus;
    result["passwordFormat"] = passwordFormat(user.password);

    if (password) {
      result["passwordMatches"] = await bcrypt.compare(password, user.password);
    }
  }

  result["otherCollections"] = await Promise.all(
    ["users", "businesses", "freelancers"].map((collection) => collectionHasEmail(collection, email)),
  );

  console.log(JSON.stringify(result, null, 2));
}

function resolveDemoPassword(args: Args): string {
  const value = args.demoPassword ?? process.env[DEMO_PASSWORD_ENV];
  if (!value) {
    throw new Error(
      `Demo user creation requires --demo-password or ${DEMO_PASSWORD_ENV}. ` +
        "Do not commit this value; pass it only at runtime.",
    );
  }
  return value;
}

async function ensureDemoUsers(resetPasswords: boolean, demoPassword: string) {
  const hashed = await bcrypt.hash(demoPassword, 10);
  const results = [];

  for (const demo of DEMO_USERS) {
    const existing = await User.findOne({ email: demo.email });
    if (!existing) {
      const created = await User.create({
        ...demo,
        password: hashed,
        isOnline: false,
        accountStatus: "active",
        profileCompleted: true,
        emailVerified: true,
      });
      results.push({ email: demo.email, action: "created", id: String(created._id) });
      continue;
    }

    if (resetPasswords) {
      existing.password = hashed;
      existing.name = existing.name || demo.name;
      existing.role = existing.role || demo.role;
      existing.accountStatus = "active";
      existing.profileCompleted = true;
      existing.emailVerified = true;
      await existing.save();
      results.push({ email: demo.email, action: "password_reset", id: String(existing._id) });
      continue;
    }

    results.push({ email: demo.email, action: "already_exists", id: String(existing._id) });
  }

  console.log(JSON.stringify({ results }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongoDB();

  console.log(
    JSON.stringify(
      {
        connected: true,
        database: mongoose.connection.db?.databaseName,
        liveRoomUsers: await User.countDocuments(),
      },
      null,
      2,
    ),
  );

  if (args.ensureDemoUsers) {
    await ensureDemoUsers(args.resetDemoPasswords, resolveDemoPassword(args));
  }

  for (const email of args.emails) {
    await diagnoseEmail(email, args.password);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
