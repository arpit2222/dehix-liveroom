import puppeteer from "puppeteer";

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
};

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
      <span></span>
      <h2>${escapeHtml(title)}</h2>
    </div>
    ${content}
  </section>`;
}

function renderHero(meta: ReportMeta): string {
  const score = parseScore(meta.score);
  const scorePercent = score === undefined ? 0 : Math.max(0, Math.min(100, score * 10));

  return `<header class="hero">
    <div class="hero-copy">
      <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
      <h1>${escapeHtml(meta.title)}</h1>
      <p>${escapeHtml(meta.subtitle)}</p>
      <div class="hero-meta">
        <span>Generated ${escapeHtml(new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }))}</span>
        ${meta.region ? `<span>${escapeHtml(formatValue(meta.region))}</span>` : ""}
      </div>
    </div>
    <div class="hero-panel">
      <div class="verdict-label">Verdict</div>
      <div class="verdict-value">${escapeHtml(formatValue(meta.verdict ?? "In review"))}</div>
      <div class="hero-score ${scoreTone(meta.score)}">
        <strong>${escapeHtml(score === undefined ? "N/A" : String(score))}</strong>
        <span>/10</span>
      </div>
      <div class="score-track hero-track"><div style="width: ${scorePercent}%"></div></div>
    </div>
  </header>`;
}

function baseHtml(meta: ReportMeta, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18212f;
      --muted: #647084;
      --line: #dde5ef;
      --paper: #f5f7fb;
      --panel: #ffffff;
      --brand: #1967d2;
      --brand-dark: #123f8c;
      --aqua: #0d9488;
      --green: #15803d;
      --amber: #b45309;
      --red: #b91c1c;
      --violet: #6d28d9;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.55;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: var(--paper);
    }

    .hero {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 28px;
      padding: 34px 40px 28px;
      color: #ffffff;
      background: linear-gradient(135deg, #123f8c 0%, #1967d2 48%, #0d9488 100%);
    }

    .eyebrow {
      margin-bottom: 10px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
      opacity: 0.82;
    }

    h1, h2, h3, p { margin: 0; }

    h1 {
      max-width: 640px;
      font-size: 28px;
      line-height: 1.15;
      font-weight: 850;
      letter-spacing: 0;
    }

    .hero-copy p {
      max-width: 610px;
      margin-top: 12px;
      color: rgba(255, 255, 255, 0.88);
      font-size: 13px;
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }

    .hero-meta span {
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 999px;
      padding: 5px 10px;
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
    }

    .hero-panel {
      align-self: stretch;
      border: 1px solid rgba(255, 255, 255, 0.32);
      border-radius: 8px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.14);
    }

    .verdict-label {
      color: rgba(255, 255, 255, 0.74);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .verdict-value {
      margin-top: 6px;
      font-size: 17px;
      font-weight: 850;
      line-height: 1.25;
    }

    .hero-score {
      margin-top: 20px;
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .hero-score strong {
      font-size: 42px;
      line-height: 1;
    }

    .hero-score span { font-weight: 800; opacity: 0.78; }

    .content { padding: 26px 40px 40px; }

    .report-section {
      page-break-inside: avoid;
      margin-bottom: 20px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 8px 22px rgba(31, 45, 61, 0.06);
    }

    .section-heading {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .section-heading span {
      width: 7px;
      height: 24px;
      border-radius: 999px;
      background: var(--brand);
    }

    .market .section-heading span { background: var(--aqua); }
    .business .section-heading span { background: var(--violet); }
    .risks .section-heading span { background: var(--amber); }
    .scores .section-heading span { background: var(--green); }

    h2 {
      color: var(--ink);
      font-size: 17px;
      line-height: 1.2;
      font-weight: 850;
      letter-spacing: 0;
    }

    h3 {
      color: var(--ink);
      font-size: 13px;
      line-height: 1.3;
      font-weight: 800;
      letter-spacing: 0;
    }

    .lead {
      color: #344156;
      font-size: 14px;
      line-height: 1.65;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .field {
      min-height: 78px;
      border: 1px solid #e3eaf3;
      border-radius: 8px;
      padding: 12px;
      background: #fbfdff;
    }

    .field-label {
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .field-value {
      color: #263244;
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .score-grid, .card-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .score-card, .info-card {
      page-break-inside: avoid;
      border: 1px solid #e1e8f2;
      border-radius: 8px;
      padding: 14px;
      background: #fbfdff;
    }

    .score-card.strong { border-color: #bbf7d0; background: #f0fdf4; }
    .score-card.medium { border-color: #bfdbfe; background: #eff6ff; }
    .score-card.caution { border-color: #fed7aa; background: #fff7ed; }

    .score-label {
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .score-value {
      margin-top: 8px;
      font-size: 25px;
      font-weight: 850;
      line-height: 1;
    }

    .score-value span {
      margin-left: 3px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    .score-track {
      height: 7px;
      margin-top: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(15, 23, 42, 0.12);
    }

    .score-track div {
      height: 100%;
      border-radius: inherit;
      background: currentColor;
    }

    .hero-track { color: #ffffff; background: rgba(255, 255, 255, 0.22); }
    .strong { color: var(--green); }
    .medium { color: var(--brand); }
    .caution { color: var(--amber); }
    .neutral { color: var(--muted); }

    .info-card p {
      margin-top: 8px;
      color: #344156;
      overflow-wrap: anywhere;
    }

    ul {
      margin: 9px 0 0;
      padding-left: 18px;
    }

    li {
      margin: 5px 0;
      color: #344156;
      overflow-wrap: anywhere;
    }

    .muted { color: var(--muted); }

    .nested-block {
      page-break-inside: avoid;
      margin-top: 12px;
      border-left: 3px solid #dbeafe;
      padding-left: 12px;
    }

    .nested-block h3 { margin-bottom: 8px; }

    .two-column {
      columns: 2;
      column-gap: 18px;
    }

    @page { size: A4; margin: 0; }

  </style>
</head>
<body>
  <main class="page">
    ${renderHero(meta)}
    <div class="content">${body}</div>
  </main>
</body>
</html>`;
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"],
  });

  try {
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
  } finally {
    await browser.close();
  }
}

export async function buildBusinessValidationPdf(title: string, analysis: any): Promise<Buffer> {
  const research = analysis?.research_analysis ?? {};
  const scores = research?.dimensional_scores ?? {};

  const scoreMetrics: ScoreMetric[] = [
    { label: "Market Opportunity", value: scores?.market_opportunity },
    { label: "Problem Clarity", value: scores?.problem_clarity },
    { label: "Solution Differentiation", value: scores?.solution_differentiation },
    { label: "Execution Feasibility", value: scores?.execution_feasibility },
    { label: "Revenue Potential", value: scores?.revenue_potential },
  ];

  const swotCards = [
    renderInfoCard("Strengths", undefined, asStringArray(research?.swot?.strengths), "strong"),
    renderInfoCard("Weaknesses", undefined, asStringArray(research?.swot?.weaknesses), "caution"),
    renderInfoCard("Opportunities", undefined, asStringArray(research?.swot?.opportunities), "medium"),
    renderInfoCard("Threats", undefined, asStringArray(research?.swot?.threats), "caution"),
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
      renderFieldGrid([
        { label: "Market Demand", value: research?.market_demand },
        { label: "Target Audience", value: research?.target_audience },
        { label: "Competitor Analysis", value: research?.competitor_analysis },
        { label: "Competitive Moat", value: research?.competitive_moat },
      ]),
      "market"
    ),
    renderSection(
      "Business Model",
      renderFieldGrid([
        { label: "Revenue Model", value: research?.revenue_model },
        { label: "Unit Economics", value: research?.unit_economics },
        { label: "Cost Estimation", value: research?.cost_estimation },
        { label: "Go To Market", value: research?.go_to_market_strategy },
      ]),
      "business"
    ),
    renderSection("Dimensional Scores", renderScoreMetrics(scoreMetrics), "scores"),
    renderSection(
      "Risks and Suggestions",
      `<div class="card-grid">
        ${renderInfoCard("Risks", undefined, asStringArray(research?.risks), "caution")}
        ${renderInfoCard("Suggestions", undefined, asStringArray(research?.suggestions), "medium")}
        ${renderInfoCard("Assumptions", undefined, asStringArray(research?.assumptions))}
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
  }, body));
}

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
  const titleEntry = entries.find(([key]) => ["title", "name", "role", "feature", "risk", "persona", "component"].includes(key));
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
      nested.push(`<div class="nested-block"><h3>${escapeHtml(label)}</h3>${renderUnknownValue(value, depth + 1)}</div>`);
    }
  }

  return `${renderFieldGrid(fields)}${nested.join("")}`;
}

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
  const score = blueprint?.final_verdict?.mvp_confidence_score;

  return renderPdf(baseHtml({
    title,
    subtitle: "A client-ready business and development blueprint formatted from the generated AI text by the DEHIX backend.",
    eyebrow: "DEHIX Business Blueprint",
    verdict,
    score,
  }, sections.join("")));
}
