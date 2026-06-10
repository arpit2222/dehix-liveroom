import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const target = process.argv[2];
const rootDir = path.resolve(import.meta.dirname, "..");
const npmCommand = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const useShell = process.platform === "win32" && !process.env.npm_execpath;

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

const fileEnv = {
  ...parseEnvFile(path.join(rootDir, ".env")),
  ...parseEnvFile(path.join(rootDir, "artifacts", "api-server", ".env")),
};

const baseEnv = {
  ...process.env,
  ...fileEnv,
};

const targets = {
  api: {
    args: [...npmArgPrefix, "run", "dev", "--workspace=@workspace/api-server"],
    env: {
      ...baseEnv,
      NODE_ENV: baseEnv.NODE_ENV ?? "development",
      PORT: baseEnv.PORT ?? "5001",
    },
  },
  client: {
    args: [...npmArgPrefix, "run", "dev", "--workspace=@workspace/dehix-live-room"],
    env: {
      ...baseEnv,
      PORT: baseEnv.CLIENT_PORT ?? "5173",
      VITE_API_URL: baseEnv.VITE_API_URL ?? "http://localhost:5001",
    },
  },
  seed: {
    args: [...npmArgPrefix, "run", "seed", "--workspace=@workspace/api-server"],
    env: baseEnv,
  },
};

const config = targets[target];

if (!config) {
  console.error(`Unknown target "${target}". Expected one of: ${Object.keys(targets).join(", ")}`);
  process.exit(1);
}

const child = spawn(npmCommand, config.args, {
  cwd: rootDir,
  env: config.env,
  stdio: "inherit",
  shell: useShell,
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
