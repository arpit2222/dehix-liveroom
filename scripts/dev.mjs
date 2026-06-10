import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(rootDir, "scripts", "run-workspace.mjs");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function parsePort(rawPort, fallback, name) {
  const port = Number(rawPort ?? fallback);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid ${name} value: "${rawPort}"`);
  }
  return port;
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + 99}`);
}

const fileEnv = {
  ...parseEnvFile(path.join(rootDir, ".env")),
  ...parseEnvFile(path.join(rootDir, "artifacts", "api-server", ".env")),
};
const baseEnv = { ...fileEnv, ...process.env };

const preferredApiPort = parsePort(baseEnv.PORT, "5001", "PORT");
const preferredClientPort = parsePort(baseEnv.CLIENT_PORT, "5173", "CLIENT_PORT");
const apiPort = await findAvailablePort(preferredApiPort);
const clientPort = await findAvailablePort(preferredClientPort);

if (apiPort !== preferredApiPort) {
  console.warn(`[dev] PORT ${preferredApiPort} is busy; using ${apiPort} for the API.`);
}
if (clientPort !== preferredClientPort) {
  console.warn(`[dev] CLIENT_PORT ${preferredClientPort} is busy; using ${clientPort} for the client.`);
}

const devEnv = {
  ...process.env,
  PORT: String(apiPort),
  CLIENT_PORT: String(clientPort),
  VITE_API_URL: baseEnv.VITE_API_URL ?? `http://localhost:${apiPort}`,
};

const children = [
  { name: "api", child: spawn(process.execPath, [runner, "api"], { cwd: rootDir, env: devEnv, stdio: "inherit" }) },
  { name: "client", child: spawn(process.execPath, [runner, "client"], { cwd: rootDir, env: devEnv, stdio: "inherit" }) },
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

for (const { name, child } of children) {
  child.on("error", (err) => {
    console.error(`[dev:${name}] failed to start`, err);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown && code && code !== 0) {
      console.error(`[dev:${name}] exited with code ${code}${signal ? ` (${signal})` : ""}`);
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
