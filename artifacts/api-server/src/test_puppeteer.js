import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SYSTEM_CHROME_PATHS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function resolveChromeExecutablePath() {
  const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (configuredPath) return configuredPath;
  
  if (process.env.LOCALAPPDATA) {
    const userChrome = path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe");
    if (existsSync(userChrome)) return userChrome;
  }
  
  const systemPath = SYSTEM_CHROME_PATHS.find((candidate) => existsSync(candidate));
  if (systemPath) return systemPath;

  try {
    return puppeteer.executablePath();
  } catch (err) {
    console.log("puppeteer.executablePath() error:", err.message);
    return undefined;
  }
}

async function test() {
  const cacheDir = path.resolve(process.cwd(), ".cache", "puppeteer");
  console.log("Setting cache dir to:", cacheDir);
  process.env.PUPPETEER_CACHE_DIR = cacheDir;
  
  const executablePath = resolveChromeExecutablePath();
  console.log("Resolved Chrome Executable Path:", executablePath);
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=medium",
      ],
    });
    console.log("Puppeteer launched successfully!");
    const page = await browser.newPage();
    await page.setContent("<h1>Test</h1>");
    const pdf = await page.pdf({ format: "A4" });
    console.log("PDF generated successfully! Buffer length:", pdf.length);
    await browser.close();
  } catch (err) {
    console.error("Puppeteer launch failed!");
    console.error(err);
  }
}

test();
