import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ifRenderOnly = process.argv.includes("--if-render");
const isRender =
  process.env.RENDER === "true" ||
  Boolean(process.env.RENDER_SERVICE_ID) ||
  Boolean(process.env.RENDER_EXTERNAL_HOSTNAME);
const forced = process.env.PUPPETEER_INSTALL_BROWSER === "true";

if (ifRenderOnly && !isRender && !forced) {
  console.log("Skipping Puppeteer browser install outside Render.");
  process.exit(0);
}

const cacheDir =
  process.env.PUPPETEER_CACHE_DIR ||
  path.join(rootDir, "artifacts", "api-server", ".cache", "puppeteer");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`Installing Puppeteer Chrome into ${cacheDir}`);

const result = spawnSync(
  npxCommand,
  ["--yes", "puppeteer", "browsers", "install", "chrome"],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
    stdio: "inherit",
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
