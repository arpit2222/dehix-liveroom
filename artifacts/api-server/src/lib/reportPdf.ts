import { existsSync } from "node:fs";
import path from "node:path";
import { buildSimplePdf } from "./simplePdf.js";
import { logger } from "./logger.js";

type Primitive = string | number | boolean;

type Field = {
  label: string;
  value: unknown;
};

type ScoreMetric = {
  label: string;
  value: unknown;
};

type ReportMeta = {
  title: string;
  subtitle: string;
  eyebrow: string;
  verdict?: unknown;
  score?: unknown;
  region?: unknown;
  theme?: { brand: string; brandDark: string };
};

const SYSTEM_CHROME_PATHS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

type PuppeteerModule = typeof import("puppeteer");

function resolvePuppeteerCacheDir(): string {
  const configuredPath = process.env.PUPPETEER_CACHE_DIR?.trim();
  if (configuredPath) return configuredPath;

  const candidates = [
    path.resolve(process.cwd(), ".cache", "puppeteer"),
    path.resolve(process.cwd(), "artifacts", "api-server", ".cache", "puppeteer"),
    path.resolve(process.cwd(), "..", "..", "artifacts", "api-server", ".cache", "puppeteer"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function ensurePuppeteerCacheDir() {
  process.env.PUPPETEER_CACHE_DIR ||= resolvePuppeteerCacheDir();
}

function resolveChromeExecutablePath(puppeteer: PuppeteerModule["default"]): string | undefined {
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
  } catch {
    return undefined;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function primitiveValue(value: unknown): Primitive | undefined {
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as Primitive;
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  const primitive = primitiveValue(value);
  if (primitive !== undefined) return String(primitive);
  if (value === null || value === undefined) return "Not available";
  return JSON.stringify(value);
}

function parseScore(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function scoreTone(value: unknown): string {
  const score = parseScore(value);
  if (score === undefined) return "neutral";
  if (score >= 8) return "strong";
  if (score >= 6) return "medium";
  return "caution";
}

// ─── HTML RENDERING ──────────────────────────────────────────────────────────

function renderFieldGrid(fields: Field[]): string {
  const visible = fields.filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim() !== "");
  if (visible.length === 0) return "";

  return `<div class="field-grid">${visible
    .map(
      (field) => `<div class="field">
        <div class="field-label">${escapeHtml(field.label)}</div>
        <div class="field-value">${escapeHtml(formatValue(field.value))}</div>
      </div>`
    )
    .join("")}</div>`;
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return `<p class="muted">Not available.</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderScoreMetrics(metrics: ScoreMetric[]): string {
  const visible = metrics.filter((metric) => metric.value !== undefined && metric.value !== null);
  if (visible.length === 0) return "";

  return `<div class="score-grid">${visible
    .map((metric) => {
      const score = parseScore(metric.value);
      const percent = score === undefined ? 0 : Math.max(0, Math.min(100, score * 10));
      return `<div class="score-card ${scoreTone(metric.value)}">
        <div class="score-label">${escapeHtml(metric.label)}</div>
        <div class="score-value">${escapeHtml(formatValue(metric.value))}<span>/10</span></div>
        <div class="score-track"><div style="width: ${percent}%"></div></div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderInfoCard(title: string, body?: unknown, items?: string[], tone = "default"): string {
  const hasBody = body !== undefined && body !== null && String(body).trim() !== "";
  const hasItems = items && items.length > 0;

  return `<article class="info-card ${tone}">
    <h3>${escapeHtml(title)}</h3>
    ${hasBody ? `<p>${escapeHtml(formatValue(body))}</p>` : ""}
    ${items ? renderList(items) : hasItems ? renderList(items ?? []) : ""}
  </article>`;
}

function renderSection(title: string, content: string, accent = ""): string {
  if (!content.trim()) return "";
  return `<section class="report-section ${accent}">
    <div class="section-heading">
      <h2>${escapeHtml(title)}</h2>
    </div>
    ${content}
  </section>`;
}

function renderHero(meta: ReportMeta): string {
  const hasPanel = meta.score != null || meta.verdict != null;
  const score = parseScore(meta.score);
  const scorePercent = score === undefined ? 0 : Math.max(0, Math.min(100, score * 10));
  const tone = scoreTone(meta.score);

  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

  const panel = hasPanel ? `
    <div class="hero-panel">
      <div class="verdict-label">Assessment</div>
      <div class="verdict-value">${escapeHtml(formatValue(meta.verdict ?? "In Review"))}</div>
      <div class="hero-score ${tone}">
        <strong>${escapeHtml(score === undefined ? "N/A" : String(score))}</strong>
        <span>/10</span>
      </div>
      <div class="score-track hero-track"><div style="width: ${scorePercent}%"></div></div>
    </div>` : "";

  return `<header class="hero${hasPanel ? "" : " hero-clean"}">
    <div class="hero-accent"></div>
    <div class="hero-inner">
      <div class="hero-brand">
        <span class="brand-mark">DEHIX</span>
        <span class="brand-sep"></span>
        <span class="brand-doc-type">${escapeHtml(meta.eyebrow)}</span>
      </div>
      <div class="hero-body">
        <div class="hero-left">
          <h1>${escapeHtml(meta.title)}</h1>
          <p class="hero-subtitle">${escapeHtml(meta.subtitle)}</p>
          <div class="hero-meta">
            <span class="meta-pill">${escapeHtml(date)}</span>
            ${meta.region ? `<span class="meta-pill">${escapeHtml(formatValue(meta.region))}</span>` : ""}
            <span class="meta-pill conf-pill">Confidential</span>
          </div>
        </div>
        ${panel}
      </div>
    </div>
    <div class="hero-bottom-bar"></div>
  </header>`;
}

function baseHtml(meta: ReportMeta, body: string): string {
  const customStyles = meta.theme ? `
    :root {
      --brand: ${meta.theme.brand};
      --brand-dark: ${meta.theme.brandDark};
    }
  ` : "";

  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    /* ─── DESIGN TOKENS ─────────────────────────────────────────── */
    :root {
      color-scheme: light;
      --ink:        #0F172A;
      --body:       #334155;
      --muted:      #64748B;
      --subtle:     #94A3B8;
      --line:       #E2E8F0;
      --line-light: #F1F5F9;
      --panel:      #FFFFFF;
      --brand:      #1967d2;
      --brand-dark: #123f8c;
      --green:      #059669;
      --amber:      #D97706;
      --red:        #DC2626;
      --violet:     #7C3AED;
      --aqua:       #0D9488;
    }
    ${customStyles}

    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--panel);
      color: var(--body);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system,
                   BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11.5px;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    h1, h2, h3, p { margin: 0; }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: var(--panel);
      position: relative;
    }

    /* ─── HERO ──────────────────────────────────────────────────── */

    .hero {
      position: relative;
      background: #0D1117;
      color: #fff;
    }

    /* Vertical brand-color accent strip on left edge */
    .hero-accent {
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      background: var(--brand);
    }

    .hero-inner {
      padding: 28px 44px 24px 50px;
    }

    /* DEHIX wordmark + doc-type row */
    .hero-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
    }

    .brand-mark {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.88);
    }

    .brand-sep {
      display: inline-block;
      width: 1px;
      height: 11px;
      background: rgba(255, 255, 255, 0.18);
    }

    .brand-doc-type {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.36);
    }

    /* Two-column layout: title/meta | score panel */
    .hero-body {
      display: grid;
      grid-template-columns: 1fr 196px;
      gap: 28px;
      align-items: center;
    }

    .hero-clean .hero-body {
      grid-template-columns: 1fr;
    }

    h1 {
      font-size: 23px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.022em;
      color: #FFFFFF;
      max-width: 520px;
      margin-bottom: 9px;
    }

    .hero-subtitle {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.56);
      line-height: 1.65;
      max-width: 490px;
      margin-bottom: 18px;
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .meta-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .conf-pill {
      background: rgba(220, 38, 38, 0.14);
      border-color: rgba(220, 38, 38, 0.28);
      color: #FCA5A5;
    }

    /* Score / verdict panel (right column) */
    .hero-panel {
      padding: 16px 18px;
      background: rgba(255, 255, 255, 0.055);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
    }

    .verdict-label {
      font-size: 7px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.38);
      margin-bottom: 5px;
    }

    .verdict-value {
      font-size: 12.5px;
      font-weight: 800;
      color: #FFFFFF;
      line-height: 1.3;
      margin-bottom: 16px;
    }

    .hero-score {
      display: flex;
      align-items: baseline;
      gap: 3px;
      margin-bottom: 10px;
    }

    .hero-score strong {
      font-size: 36px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.03em;
    }

    .hero-score span {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.38);
    }

    /* Score tone colours (hero) */
    .hero-score.strong { color: #34D399; }
    .hero-score.medium { color: #60A5FA; }
    .hero-score.caution { color: #FBBF24; }
    .hero-score.neutral { color: rgba(255, 255, 255, 0.7); }

    /* Hero progress track */
    .hero-track {
      height: 4px;
      border-radius: 2px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.1);
    }

    .hero-track div {
      height: 100%;
      border-radius: inherit;
      background: rgba(255, 255, 255, 0.6);
    }

    /* 3 px brand gradient bar at bottom of hero */
    .hero-bottom-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--brand) 0%, var(--brand-dark) 100%);
    }

    /* ─── CONTENT BODY ──────────────────────────────────────────── */

    .content {
      padding: 30px 44px 80px 50px;
      counter-reset: section-counter;
    }

    /* ─── SECTIONS ──────────────────────────────────────────────── */

    .report-section {
      page-break-inside: avoid;
      margin-bottom: 26px;
    }

    .section-heading {
      display: flex;
      align-items: center;
      gap: 11px;
      margin-bottom: 13px;
      padding-bottom: 9px;
      border-bottom: 1.5px solid var(--line);
    }

    /* Auto-incrementing section counter badge */
    .section-heading::before {
      counter-increment: section-counter;
      content: counter(section-counter, decimal-leading-zero);
      font-size: 8.5px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: var(--brand);
      flex-shrink: 0;
    }

    /* Accent-variant counter colours */
    .market   .section-heading::before { color: var(--aqua);   }
    .business .section-heading::before { color: var(--violet); }
    .risks    .section-heading::before { color: var(--amber);  }
    .scores   .section-heading::before { color: var(--green);  }

    h2 {
      font-size: 13.5px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.012em;
      line-height: 1.2;
    }

    h3 {
      font-size: 11px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.3;
    }

    .lead {
      font-size: 12.5px;
      color: var(--body);
      line-height: 1.78;
    }

    /* ─── FIELD GRID ────────────────────────────────────────────── */

    /* Tile-table: cells share their borders via gap+background trick */
    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .field {
      padding: 13px 15px;
      background: var(--panel);
      min-height: 66px;
    }

    .field-label {
      font-size: 7.5px;
      font-weight: 800;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .field-value {
      font-size: 11.5px;
      font-weight: 500;
      color: var(--ink);
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    /* ─── SCORE & INFO CARDS ────────────────────────────────────── */

    .score-grid, .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .score-card, .info-card {
      page-break-inside: avoid;
      background: var(--panel);
      border: 1px solid var(--line);
      border-top: 3px solid var(--line);   /* neutral default top accent */
      border-radius: 8px;
      padding: 15px;
    }

    /* Tone-coloured top border */
    .score-card.strong, .info-card.strong { border-top-color: var(--green);  }
    .score-card.medium, .info-card.medium { border-top-color: var(--brand);  }
    .score-card.caution, .info-card.caution { border-top-color: var(--amber);  }

    /* Score card typography */
    .score-label {
      font-size: 7.5px;
      font-weight: 800;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }

    .score-value {
      font-size: 27px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.02em;
      color: var(--ink);
      margin-bottom: 10px;
    }

    /* Tone-coloured score number */
    .score-card.strong .score-value { color: var(--green);  }
    .score-card.medium .score-value { color: var(--brand);  }
    .score-card.caution .score-value { color: var(--amber);  }

    .score-value span {
      font-size: 11px;
      font-weight: 600;
      color: var(--subtle);
      margin-left: 2px;
    }

    /* Progress track */
    .score-track {
      height: 5px;
      background: var(--line);
      border-radius: 3px;
      overflow: hidden;
    }

    .score-track div {
      height: 100%;
      border-radius: inherit;
      background: var(--brand);
    }

    .score-card.strong .score-track div { background: var(--green); }
    .score-card.medium .score-track div { background: var(--brand); }
    .score-card.caution .score-track div { background: var(--amber); }

    /* Info card body */
    .info-card p {
      margin-top: 8px;
      color: var(--body);
      font-size: 11px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    /* ─── TYPOGRAPHY ────────────────────────────────────────────── */

    p { margin: 0; }

    ul {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }

    li {
      position: relative;
      padding-left: 14px;
      margin-bottom: 5px;
      color: var(--body);
      font-size: 11px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    li::before {
      content: "›";
      position: absolute;
      left: 0;
      top: 0;
      color: var(--brand);
      font-weight: 700;
    }

    .muted { color: var(--muted); font-size: 11px; }

    /* ─── NESTED BLOCK ──────────────────────────────────────────── */

    .nested-block {
      page-break-inside: avoid;
      margin-top: 12px;
      padding: 12px 15px;
      border-left: 3px solid var(--brand);
      border-radius: 0 6px 6px 0;
      background: var(--line-light);
    }

    .nested-block h3 { margin-bottom: 8px; color: var(--ink); }

    .two-column { columns: 2; column-gap: 18px; }

    /* ─── REPEATING PAGE FOOTER ─────────────────────────────────── */
    /*
     * position: fixed in Chromium print mode repeats on every PDF page,
     * so this footer appears at the bottom of every sheet.
     * The 80px bottom padding on .content ensures content never overlaps it.
     */
    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 30px;
      padding: 0 44px 0 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--panel);
      border-top: 1px solid var(--line);
      font-size: 7.5px;
      font-weight: 600;
      color: var(--subtle);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .footer-brand {
      font-weight: 900;
      letter-spacing: 0.22em;
      color: var(--muted);
    }

    .footer-center {
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @page { size: A4; margin: 0; }

  </style>
</head>
<body>
  <main class="page">
    ${renderHero(meta)}
    <div class="content">${body}</div>
  </main>
  <footer class="pdf-footer">
    <span class="footer-brand">DEHIX</span>
    <span class="footer-center">${escapeHtml(meta.title)}</span>
    <span>${escapeHtml(date)} &nbsp;·&nbsp; Confidential</span>
  </footer>
</body>
</html>`;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderPdf(html: string): Promise<Buffer> {
  let browser: import("puppeteer").Browser | null = null;
  let executablePath: string | undefined;

  try {
    ensurePuppeteerCacheDir();
    const puppeteer = (await import("puppeteer")).default;
    executablePath = resolveChromeExecutablePath(puppeteer);
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=medium",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn(
      {
        err,
        chromeExecutablePath: executablePath ?? null,
        puppeteerCacheDir: process.env.PUPPETEER_CACHE_DIR ?? null,
      },
      "Puppeteer PDF render failed; falling back to simple PDF"
    );
    return buildSimplePdf("DEHIX Report", [
      {
        text: "Styled PDF rendering failed in this environment, so this fallback PDF contains the report content in a simplified format.",
        size: 10,
        gapAfter: 14,
      },
      { text: htmlToPlainText(html) },
    ]);
  } finally {
    await browser?.close().catch((err) => {
      logger.warn({ err }, "Failed to close Puppeteer browser");
    });
  }
}

// ─── EXPORT: BUSINESS VALIDATION ─────────────────────────────────────────────

export async function buildBusinessValidationPdf(title: string, analysis: any): Promise<Buffer> {
  const research = analysis?.research_analysis ?? {};
  const scores = research?.dimensional_scores ?? {};

  const scoreMetrics: ScoreMetric[] = [
    { label: "Market Opportunity",       value: scores?.market_opportunity       },
    { label: "Problem Clarity",          value: scores?.problem_clarity          },
    { label: "Solution Differentiation", value: scores?.solution_differentiation },
    { label: "Execution Feasibility",    value: scores?.execution_feasibility    },
    { label: "Revenue Potential",        value: scores?.revenue_potential        },
  ];

  const swotCards = [
    renderInfoCard("Strengths",     undefined, asStringArray(research?.swot?.strengths),     "strong"),
    renderInfoCard("Weaknesses",    undefined, asStringArray(research?.swot?.weaknesses),    "caution"),
    renderInfoCard("Opportunities", undefined, asStringArray(research?.swot?.opportunities), "medium"),
    renderInfoCard("Threats",       undefined, asStringArray(research?.swot?.threats),       "caution"),
  ].join("");

  const body = [
    renderSection(
      "Idea Summary",
      `<p class="lead">${escapeHtml(analysis?.idea_summary ?? "No summary provided.")}</p>`
    ),
    renderSection(
      "Verdict Reasoning",
      `<p class="lead">${escapeHtml(research?.verdict_reasoning ?? "No verdict reasoning provided.")}</p>`
    ),
    renderSection(
      "Market and Audience",
      [
        renderFieldGrid([
          { label: "Market Demand",       value: research?.market_demand       },
          { label: "Target Audience",     value: research?.target_audience     },
          { label: "Competitor Analysis", value: research?.competitor_analysis },
          { label: "Competitive Moat",    value: research?.competitive_moat   },
        ]),
        (research?.market_size_tam || research?.market_size_sam || research?.market_size_som) ? `
          <div class="nested-block">
            <h3>Estimated Market Size (TAM / SAM / SOM)</h3>
            ${renderFieldGrid([
              { label: "Total Addressable Market (TAM)", value: research.market_size_tam },
              { label: "Serviceable Addressable Market (SAM)", value: research.market_size_sam },
              { label: "Serviceable Obtainable Market (SOM)", value: research.market_size_som },
            ])}
          </div>
        ` : ""
      ].join(""),
      "market"
    ),
    renderSection(
      "Business Model",
      [
        renderFieldGrid([
          { label: "Revenue Model",   value: research?.revenue_model         },
          { label: "Unit Economics",  value: research?.unit_economics        },
          { label: "Cost Estimation", value: research?.cost_estimation       },
          { label: "Go To Market",    value: research?.go_to_market_strategy },
        ]),
        research?.pricing_strategy ? `
          <div class="nested-block">
            <h3>Pricing & Tiering Strategy</h3>
            <p>${escapeHtml(research.pricing_strategy)}</p>
          </div>
        ` : ""
      ].join(""),
      "business"
    ),
    renderSection("Dimensional Scores", renderScoreMetrics(scoreMetrics), "scores"),
    renderSection(
      "Risks and Suggestions",
      `<div class="card-grid">
        ${renderInfoCard("Risks",        undefined, asStringArray(research?.risks),       "caution")}
        ${renderInfoCard("Suggestions",  undefined, asStringArray(research?.suggestions), "medium")}
        ${renderInfoCard("Assumptions",  undefined, asStringArray(research?.assumptions))}
      </div>`,
      "risks"
    ),
    renderSection("SWOT Snapshot", `<div class="card-grid">${swotCards}</div>`),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "A polished validation report generated from the AI business analysis and formatted by the DEHIX backend.",
    eyebrow: "DEHIX Business Validation",
    verdict: research?.final_verdict,
    score: research?.overall_score,
    region: analysis?.region_used,
    theme: { brand: "#0d9488", brandDark: "#0f766e" },
  }, body));
}

// ─── DYNAMIC RENDERING (for buildBusinessBlueprintPdf) ───────────────────────

function renderUnknownValue(value: unknown, depth = 0): string {
  const primitive = primitiveValue(value);
  if (primitive !== undefined) {
    return `<p>${escapeHtml(String(primitive))}</p>`;
  }

  if (value === null || value === undefined) {
    return `<p class="muted">Not available.</p>`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `<p class="muted">Not available.</p>`;
    const primitiveItems = value.map(primitiveValue);
    if (primitiveItems.every((item) => item !== undefined)) {
      return renderList(primitiveItems.map((item) => String(item)));
    }
    return `<div class="card-grid">${value.map((item, index) => renderObjectCard(item, `Item ${index + 1}`, depth + 1)).join("")}</div>`;
  }

  if (isPlainRecord(value)) {
    return renderRecord(value, depth);
  }

  return `<p>${escapeHtml(formatValue(value))}</p>`;
}

function renderObjectCard(value: unknown, fallbackTitle: string, depth: number): string {
  if (!isPlainRecord(value)) {
    return renderInfoCard(fallbackTitle, formatValue(value));
  }

  const entries = Object.entries(value);
  const titleEntry = entries.find(([key]) =>
    ["title", "name", "role", "feature", "risk", "persona", "component"].includes(key)
  );
  const title = titleEntry ? formatValue(titleEntry[1]) : fallbackTitle;
  const rest = Object.fromEntries(entries.filter(([key]) => key !== titleEntry?.[0]));

  return `<article class="info-card">
    <h3>${escapeHtml(title)}</h3>
    ${renderRecord(rest, depth)}
  </article>`;
}

function renderRecord(record: Record<string, unknown>, depth: number): string {
  const fields: Field[] = [];
  const nested: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    const label = humanizeKey(key);
    if (primitiveValue(value) !== undefined || value === null || value === undefined) {
      fields.push({ label, value });
    } else {
      nested.push(
        `<div class="nested-block"><h3>${escapeHtml(label)}</h3>${renderUnknownValue(value, depth + 1)}</div>`
      );
    }
  }

  return `${renderFieldGrid(fields)}${nested.join("")}`;
}

// ─── EXPORT: BUSINESS BLUEPRINT ──────────────────────────────────────────────

export async function buildBusinessBlueprintPdf(title: string, blueprint: any): Promise<Buffer> {
  const preferredOrder = [
    "executive_summary",
    "problem_definition",
    "target_users",
    "product_strategy",
    "mvp_definition",
    "user_journey",
    "technical_architecture",
    "security_and_compliance",
    "development_roadmap",
    "team_requirements",
    "cost_estimation",
    "business_model",
    "go_to_market",
    "risk_analysis",
    "founder_recommendations",
    "final_verdict",
    "next_options",
  ];

  const sections: string[] = [];
  for (const key of preferredOrder) {
    if (blueprint?.[key] !== undefined) {
      sections.push(renderSection(humanizeKey(key), renderUnknownValue(blueprint[key])));
    }
  }

  for (const [key, value] of Object.entries(blueprint ?? {})) {
    if (!preferredOrder.includes(key) && key !== "step") {
      sections.push(renderSection(humanizeKey(key), renderUnknownValue(value)));
    }
  }

  const verdict = blueprint?.final_verdict?.build_now_or_not ?? blueprint?.final_verdict;
  const score   = blueprint?.final_verdict?.mvp_confidence_score;

  return renderPdf(baseHtml({
    title,
    subtitle: "A client-ready business and development blueprint formatted from the generated AI text by the DEHIX backend.",
    eyebrow: "DEHIX Business Blueprint",
    verdict,
    score,
    theme: { brand: "#1e40af", brandDark: "#1e3a8a" },
  }, sections.join("")));
}

// ─── GENERATED DOC PDF ───────────────────────────────────────────────────────

function parseDocContentToHtml(content: string): string {
  const lines = content.split("\n");
  let html = "";
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }

    if (line.includes("═") || line.includes("─")) {
      if (inList) { html += "</ul>"; inList = false; }
      const cleanText = line.replace(/[═─\s]+/g, "").trim();
      if (cleanText) {
        html += `<h2 class="doc-section-header">${escapeHtml(cleanText)}</h2>`;
      } else {
        html += '<hr class="doc-divider" />';
      }
      continue;
    }

    if (line.startsWith("###")) {
      if (inList) { html += "</ul>"; inList = false; }
      const headingText = line.replace(/^###\s*/, "").trim();
      html += `<h3>${escapeHtml(headingText)}</h3>`;
      continue;
    }

    if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
      if (!inList) { html += "<ul>"; inList = true; }
      const listItemText = line.replace(/^[•\-*]\s*/, "").trim();
      html += `<li>${escapeHtml(listItemText)}</li>`;
      continue;
    }

    if (inList) { html += "</ul>"; inList = false; }

    if (line.length < 80 && /^[A-Z0-9\s&()\-:,./]+$/.test(line) && !line.includes(".")) {
      html += `<h4 class="doc-subsection-header">${escapeHtml(line)}</h4>`;
    } else {
      html += `<p>${escapeHtml(line)}</p>`;
    }
  }

  if (inList) html += "</ul>";
  return html;
}

const DOC_TYPE_THEMES: Record<string, { brand: string; brandDark: string; eyebrow: string }> = {
  idea_validation_report:        { brand: "#0d9488", brandDark: "#115e59", eyebrow: "DEHIX Idea Validation Report"           },
  business_requirement_document: { brand: "#1e40af", brandDark: "#1e3a8a", eyebrow: "DEHIX Business Requirement Document"    },
  project_requirement_document:  { brand: "#2563eb", brandDark: "#1e40af", eyebrow: "DEHIX Project Requirement Document"     },
  mvp_scope_document:            { brand: "#7c3aed", brandDark: "#5b21b6", eyebrow: "DEHIX MVP Scope Document"               },
  technical_architecture_document:{ brand: "#475569", brandDark: "#1e293b", eyebrow: "DEHIX Technical Architecture Specification" },
  feature_list_document:         { brand: "#4f46e5", brandDark: "#3730a3", eyebrow: "DEHIX Feature List Document"            },
  development_roadmap:           { brand: "#d97706", brandDark: "#92400e", eyebrow: "DEHIX Development Roadmap"              },
  pitch_deck:                    { brand: "#0d9488", brandDark: "#115e59", eyebrow: "DEHIX Pitch Deck"                       },
  technical_deck:                { brand: "#475569", brandDark: "#1e293b", eyebrow: "DEHIX Technical Deck"                   },
  bd_strategy:                   { brand: "#4f46e5", brandDark: "#3730a3", eyebrow: "DEHIX Business Development Strategy"    },
  sow:                           { brand: "#7c3aed", brandDark: "#5b21b6", eyebrow: "DEHIX Statement of Work"                },
  project_brief:                 { brand: "#1e40af", brandDark: "#1e3a8a", eyebrow: "DEHIX Project Brief"                    },
};

export async function buildGeneratedDocPdf(title: string, documentType: string, content: string): Promise<Buffer> {
  const parsedHtml = parseDocContentToHtml(content);
  const theme = DOC_TYPE_THEMES[documentType] ?? { brand: "#1967d2", brandDark: "#123f8c", eyebrow: "DEHIX AI Generated Document" };

  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

  const finalHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* ─── TOKENS ─── */
    :root {
      --ink:        #0F172A;
      --body:       #334155;
      --muted:      #64748B;
      --subtle:     #94A3B8;
      --line:       #E2E8F0;
      --line-light: #F1F5F9;
      --panel:      #FFFFFF;
      --brand:      ${theme.brand};
      --brand-dark: ${theme.brandDark};
    }

    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--panel);
      color: var(--body);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system,
                   BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11.5px;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    h1, h2, h3, h4, p { margin: 0; }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: var(--panel);
    }

    /* ─── HEADER ─── */

    .header {
      position: relative;
      background: #0D1117;
    }

    .header-accent {
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      background: var(--brand);
    }

    .header-inner {
      padding: 26px 44px 22px 50px;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 20px;
    }

    .brand-mark {
      font-size: 9.5px;
      font-weight: 900;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.85);
    }

    .brand-sep {
      display: inline-block;
      width: 1px;
      height: 10px;
      background: rgba(255, 255, 255, 0.18);
    }

    .brand-doc-type {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.34);
    }

    h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.022em;
      line-height: 1.2;
      color: #FFFFFF;
      margin-bottom: 7px;
    }

    .subtitle {
      font-size: 10.5px;
      color: rgba(255, 255, 255, 0.52);
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .header-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .meta-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.52);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .conf-pill {
      background: rgba(220, 38, 38, 0.14);
      border-color: rgba(220, 38, 38, 0.28);
      color: #FCA5A5;
    }

    .header-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--brand) 0%, var(--brand-dark) 100%);
    }

    /* ─── CONTENT ─── */

    .content {
      padding: 28px 44px 80px 50px;
      counter-reset: section-counter;
    }

    .doc-section-header {
      font-size: 9.5px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink);
      margin-top: 26px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid var(--line);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .doc-section-header::before {
      counter-increment: section-counter;
      content: counter(section-counter, decimal-leading-zero);
      font-size: 8.5px;
      font-weight: 900;
      color: var(--brand);
      flex-shrink: 0;
    }

    .doc-subsection-header {
      font-size: 11px;
      font-weight: 700;
      color: var(--ink);
      margin-top: 14px;
      margin-bottom: 6px;
    }

    h3 {
      font-size: 11px;
      font-weight: 700;
      color: var(--brand);
      margin-top: 13px;
      margin-bottom: 6px;
    }

    p {
      margin: 0 0 8px;
      color: var(--body);
      line-height: 1.65;
    }

    ul {
      margin: 0 0 11px;
      padding: 0;
      list-style: none;
    }

    li {
      position: relative;
      padding-left: 14px;
      margin-bottom: 5px;
      color: var(--body);
      font-size: 11px;
      line-height: 1.55;
    }

    li::before {
      content: "›";
      position: absolute;
      left: 0;
      color: var(--brand);
      font-weight: 700;
    }

    .doc-divider {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 20px 0;
    }

    /* ─── REPEATING FOOTER ─── */

    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 30px;
      padding: 0 44px 0 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--panel);
      border-top: 1px solid var(--line);
      font-size: 7.5px;
      font-weight: 600;
      color: var(--subtle);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .footer-brand {
      font-weight: 900;
      letter-spacing: 0.22em;
      color: var(--muted);
    }

    .footer-center {
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="header-accent"></div>
      <div class="header-inner">
        <div class="header-brand">
          <span class="brand-mark">DEHIX</span>
          <span class="brand-sep"></span>
          <span class="brand-doc-type">${escapeHtml(theme.eyebrow)}</span>
        </div>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">A polished ${escapeHtml(humanizeKey(documentType))} document generated from user conversation.</p>
        <div class="header-meta">
          <span class="meta-pill">${escapeHtml(date)}</span>
          <span class="meta-pill conf-pill">Confidential</span>
        </div>
      </div>
      <div class="header-bar"></div>
    </header>
    <div class="content">${parsedHtml}</div>
  </main>
  <footer class="pdf-footer">
    <span class="footer-brand">DEHIX</span>
    <span class="footer-center">${escapeHtml(title)}</span>
    <span>${escapeHtml(date)} &nbsp;·&nbsp; Confidential</span>
  </footer>
</body>
</html>`;

  return renderPdf(finalHtml);
}

// ─── EXPORT: EXECUTIVE SUMMARY ────────────────────────────────────────────────

export async function buildExecutiveSummaryPdf(title: string, blueprint: any): Promise<Buffer> {
  const exec  = blueprint?.executive_summary ?? {};
  const prob  = blueprint?.problem_definition ?? {};
  const strat = blueprint?.product_strategy   ?? {};

  const body = [
    renderSection(
      "Overview",
      renderFieldGrid([
        { label: "Idea Name",            value: exec?.idea_name                   },
        { label: "Launch Strategy",      value: exec?.recommended_launch_strategy },
        { label: "Target Market",        value: exec?.target_market               },
        { label: "One Line Description", value: exec?.one_line_description        },
      ])
    ),
    renderSection(
      "Strategic Goal",
      `<article class="info-card medium"><h3>Business Goal</h3><p>${escapeHtml(exec?.business_goal || "Not available.")}</p></article>`
    ),
    renderSection(
      "Problem Definition",
      `<div class="card-grid">
        ${renderInfoCard("Problem Statement",             prob?.problem_statement)}
        ${renderInfoCard("Current Alternatives",         undefined, asStringArray(prob?.current_alternatives))}
        ${renderInfoCard("Why Existing Solutions Fail",  undefined, asStringArray(prob?.why_existing_solutions_fail), "caution")}
      </div>`
    ),
    renderSection(
      "Product Strategy",
      `<div class="card-grid">
        ${renderInfoCard("Core Value Proposition", strat?.core_value_proposition)}
        ${renderInfoCard("Product Positioning",    strat?.product_positioning)}
      </div>
      <div class="nested-block">
        <h3>Competitive Advantages</h3>
        ${renderList(asStringArray(strat?.competitive_advantage))}
      </div>
      <div class="nested-block">
        <h3>Success Metrics</h3>
        ${renderList(asStringArray(strat?.key_success_metrics))}
      </div>`
    ),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "A high-level report detailing the value proposition, strategy, and problem definition.",
    eyebrow: "DEHIX Executive Summary",
    theme: { brand: "#0d9488", brandDark: "#115e59" },
  }, body));
}

// ─── EXPORT: MVP SCOPE ────────────────────────────────────────────────────────

export async function buildMvpScopePdf(title: string, blueprint: any): Promise<Buffer> {
  const mvp        = blueprint?.mvp_definition ?? {};
  const mustHaves  = Array.isArray(mvp?.must_have_features)  ? mvp.must_have_features  : [];
  const shouldHaves= Array.isArray(mvp?.should_have_features) ? mvp.should_have_features : [];
  const future     = Array.isArray(mvp?.future_features)     ? mvp.future_features     : [];
  const excluded   = asStringArray(mvp?.excluded_from_mvp || mvp?.excluded);

  const mustHaveCards = mustHaves.map((item: any, idx: number) => {
    return `<article class="info-card strong">
      <h3>${escapeHtml(item?.feature || `Feature ${idx + 1}`)}</h3>
      <p><strong>Purpose:</strong> ${escapeHtml(item?.purpose || "Core requirement.")}</p>
    </article>`;
  }).join("");

  const shouldHaveCards = shouldHaves.map((item: any, idx: number) => {
    return `<article class="info-card">
      <h3>${escapeHtml(item?.feature || `Feature ${idx + 1}`)}</h3>
      <p>${escapeHtml(item?.purpose || "Important but deferred requirement.")}</p>
    </article>`;
  }).join("");

  const futureCards = future.map((item: any, idx: number) => {
    return `<article class="info-card medium">
      <h3>${escapeHtml(item?.feature || `Feature ${idx + 1}`)}</h3>
      <p><strong>Reason deferred:</strong> ${escapeHtml(item?.reason || "Future consideration.")}</p>
    </article>`;
  }).join("");

  const body = [
    renderSection(
      "MVP Goal & Core Value",
      `<p class="lead">${escapeHtml(mvp?.core_value_proposition || mvp?.mvp_goal || "Core scope boundaries defined for initial launch.")}</p>`
    ),
    renderSection(
      "Must-Have Core Features (P0)",
      `<div class="card-grid">${mustHaveCards || '<p class="muted">No critical features listed.</p>'}</div>`
    ),
    renderSection(
      "Should-Have Features (P1)",
      `<div class="card-grid">${shouldHaveCards || '<p class="muted">No secondary features listed.</p>'}</div>`
    ),
    renderSection(
      "Future Considerations (P2)",
      `<div class="card-grid">${futureCards || '<p class="muted">No future features listed.</p>'}</div>`
    ),
    renderSection(
      "Strictly Excluded from MVP",
      `<article class="info-card caution">
        <h3>Out of Scope Boundaries</h3>
        <p>To avoid scope creep, the following items are strictly excluded from version 1:</p>
        ${renderList(excluded)}
      </article>`
    ),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "Detailed MVP scope limits and prioritization boundaries to control scope creep.",
    eyebrow: "DEHIX MVP Scope",
    theme: { brand: "#7c3aed", brandDark: "#5b21b6" },
  }, body));
}

// ─── EXPORT: TECHNICAL ARCHITECTURE ──────────────────────────────────────────

export async function buildTechnicalArchitecturePdf(title: string, blueprint: any): Promise<Buffer> {
  const arch       = blueprint?.technical_architecture  ?? {};
  const security   = blueprint?.security_and_compliance ?? {};
  const stack      = arch?.recommended_stack            ?? {};
  const components = Array.isArray(arch?.system_components) ? arch.system_components : [];

  const stackFields = [
    { label: "Frontend Framework",      value: stack?.frontend       },
    { label: "Backend API Framework",   value: stack?.backend        },
    { label: "Database Layer",          value: stack?.database       },
    { label: "Authentication Provider", value: stack?.authentication },
    { label: "Cloud / Hosting Provider",value: stack?.cloud          },
    { label: "Object Storage Service",  value: stack?.storage        },
    { label: "AI Services & Models",    value: stack?.ai_services    },
  ];

  const componentCards = components.map((c: any) => {
    return `<article class="info-card">
      <h3>${escapeHtml(c?.component || "Component")}</h3>
      <p>${escapeHtml(c?.purpose || "System module.")}</p>
    </article>`;
  }).join("");

  const body = [
    renderSection("Recommended Technology Stack", renderFieldGrid(stackFields)),
    renderSection(
      "System Components & Infrastructure",
      `<div class="card-grid">${componentCards || '<p class="muted">No system components listed.</p>'}</div>`
    ),
    renderSection(
      "API Modules & Database Entities",
      `<div class="card-grid">
        ${renderInfoCard("Core API Modules",        undefined, asStringArray(arch?.api_modules))}
        ${renderInfoCard("Database Schema Entities",undefined, asStringArray(arch?.database_entities))}
      </div>`
    ),
    renderSection(
      "Security, Privacy & Compliance",
      `<div class="card-grid">
        ${renderInfoCard("Security Policies",   undefined, asStringArray(security?.security_requirements),  "strong")}
        ${renderInfoCard("Privacy Policies",    undefined, asStringArray(security?.privacy_requirements),   "medium")}
        ${renderInfoCard("Compliance Standards",undefined, asStringArray(security?.compliance_requirements),"caution")}
      </div>`
    ),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "CTO-ready technical specification, including data models and stack components.",
    eyebrow: "DEHIX Technical Specification",
    theme: { brand: "#475569", brandDark: "#1e293b" },
  }, body));
}

// ─── EXPORT: FREELANCER HIRING BRIEF ─────────────────────────────────────────

export async function buildFreelancerHiringBriefPdf(title: string, blueprint: any): Promise<Buffer> {
  const team        = blueprint?.team_requirements ?? {};
  const recommended = Array.isArray(team?.recommended_team) ? team.recommended_team : [];

  const roleCards = recommended.map((r: any, idx: number) => {
    return `<article class="info-card">
      <h3>${escapeHtml(r?.role || `Role ${idx + 1}`)}</h3>
      <p><strong>Responsibilities:</strong></p>
      ${renderList(asStringArray(r?.responsibilities))}
    </article>`;
  }).join("");

  const body = [
    renderSection(
      "Recommended Development Squad",
      `<div class="card-grid">${roleCards || '<p class="muted">No roles specified.</p>'}</div>`
    ),
    renderSection(
      "Minimum Viable Team Requirements",
      `<article class="info-card strong">
        <h3>Core Personnel</h3>
        ${renderList(asStringArray(team?.minimum_team))}
      </article>`
    ),
    renderSection(
      "Escrow Match Guidelines",
      `<p>All roles are integrated with the DEHIX reputation matching algorithm, validating developer Web3 credentials (SBTs) and github open source history before matching room assignment.</p>`
    ),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "Recommended team composition, roles, and developer credentials required.",
    eyebrow: "DEHIX Squad Hiring Brief",
    theme: { brand: "#4f46e5", brandDark: "#3730a3" },
  }, body));
}

// ─── EXPORT: ROADMAP & BUDGET ────────────────────────────────────────────────

export async function buildRoadmapBudgetPdf(title: string, blueprint: any): Promise<Buffer> {
  const road  = blueprint?.development_roadmap ?? {};
  const cost  = blueprint?.cost_estimation      ?? {};
  const biz   = blueprint?.business_model      ?? {};
  const gtm   = blueprint?.go_to_market        ?? {};

  const budget      = cost?.mvp_budget              ?? {};
  const operational = cost?.monthly_operational_cost ?? {};

  const budgetFields = [
    { label: "MVP Cost (Minimum)",     value: budget?.minimum        },
    { label: "MVP Cost (Expected)",     value: budget?.expected       },
    { label: "MVP Cost (High End)",     value: budget?.high_end       },
    { label: "Monthly Ops (Minimum)",  value: operational?.minimum   },
    { label: "Monthly Ops (Expected)",  value: operational?.expected  },
    { label: "Monthly Ops (High End)",  value: operational?.high_end  },
  ];

  const roadmapPhases = [
    { label: "Phase 1: Research & Discovery", val: road?.phase_1_discovery },
    { label: "Phase 2: Design & Prototyping", val: road?.phase_2_design    },
    { label: "Phase 3: MVP Development",      val: road?.phase_3_mvp_development },
    { label: "Phase 4: Testing & QA",         val: road?.phase_4_testing    },
    { label: "Phase 5: Launch & Post-Launch", val: road?.phase_5_launch     },
  ];

  const roadmapCards = roadmapPhases.map((phase) => {
    if (!phase.val) return "";
    return `<article class="info-card">
      <h3>${escapeHtml(phase.label)} (${escapeHtml(phase.val.duration || "N/A")})</h3>
      <p><strong>Deliverables:</strong></p>
      ${renderList(asStringArray(phase.val.deliverables))}
    </article>`;
  }).join("");

  const body = [
    renderSection("Budget & Operation Cost Estimation", renderFieldGrid(budgetFields)),
    renderSection(
      "Major Cost Drivers",
      `<div class="nested-block">
        ${renderList(asStringArray(cost?.major_cost_drivers))}
      </div>`
    ),
    renderSection(
      "Phased Development Timeline",
      `<div class="card-grid">${roadmapCards || '<p class="muted">Roadmap phases not available.</p>'}</div>`
    ),
    renderSection(
      "Business Model & Market Entry",
      `<div class="card-grid">
        ${renderInfoCard("Primary Revenue Streams", undefined, asStringArray(biz?.primary_revenue_streams), "strong")}
        ${renderInfoCard("Go-To-Market Strategy",    undefined, asStringArray(gtm?.customer_acquisition_strategy), "medium")}
      </div>`
    ),
  ].join("");

  return renderPdf(baseHtml({
    title,
    subtitle: "Projected investment ranges, development timeline, and operational runway.",
    eyebrow: "DEHIX Delivery Roadmap & Budget",
    theme: { brand: "#d97706", brandDark: "#92400e" },
  }, body));
}
