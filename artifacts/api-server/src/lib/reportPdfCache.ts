import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildBusinessBlueprintPdf, buildBusinessValidationPdf } from "./reportPdf.js";
import { logger } from "./logger.js";
import { LaunchSession, type ILaunchSession } from "../models/LaunchSession.js";

type PdfKind = "businessValidation" | "businessBlueprint";
type PdfStatus = "pending" | "ready" | "failed";

type PdfFields = {
  status: keyof ILaunchSession;
  filePath: keyof ILaunchSession;
  hash: keyof ILaunchSession;
  error: keyof ILaunchSession;
  generatedAt: keyof ILaunchSession;
};

type PdfJob = {
  kind: PdfKind;
  session: ILaunchSession;
  title: string;
  sourceHash: string;
  build: () => Promise<Buffer>;
};

const reportDir = path.resolve(process.env.REPORT_PDF_DIR ?? path.join(process.cwd(), "generated-reports", "launch"));
const inFlight = new Map<string, Promise<Buffer>>();

const pdfFields: Record<PdfKind, PdfFields> = {
  businessValidation: {
    status: "businessValidationPdfStatus",
    filePath: "businessValidationPdfPath",
    hash: "businessValidationPdfHash",
    error: "businessValidationPdfError",
    generatedAt: "businessValidationPdfGeneratedAt",
  },
  businessBlueprint: {
    status: "businessBlueprintPdfStatus",
    filePath: "businessBlueprintPdfPath",
    hash: "businessBlueprintPdfHash",
    error: "businessBlueprintPdfError",
    generatedAt: "businessBlueprintPdfGeneratedAt",
  },
};

function reportSourceHash(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\n---\n")).digest("hex");
}

function reportFileName(job: Pick<PdfJob, "kind" | "session" | "sourceHash">): string {
  const safeKind = job.kind.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  return `${String(job.session._id)}-${safeKind}-${job.sourceHash.slice(0, 16)}.pdf`;
}

function reportFilePath(job: Pick<PdfJob, "kind" | "session" | "sourceHash">): string {
  return path.join(reportDir, reportFileName(job));
}

function cachedPath(session: ILaunchSession, kind: PdfKind, sourceHash: string): string | undefined {
  const fields = pdfFields[kind];
  const status = session[fields.status] as PdfStatus | undefined;
  const storedHash = session[fields.hash] as string | undefined;
  const filePath = session[fields.filePath] as string | undefined;
  if (status === "ready" && storedHash === sourceHash && filePath) {
    return filePath;
  }
  return undefined;
}

async function readCachedPdf(session: ILaunchSession, kind: PdfKind, sourceHash: string): Promise<Buffer | undefined> {
  const filePath = cachedPath(session, kind, sourceHash);
  if (!filePath) return undefined;

  try {
    return await fs.readFile(filePath);
  } catch (err) {
    logger.warn({ err, sessionId: session._id, kind, filePath }, "Cached report PDF was missing or unreadable");
    return undefined;
  }
}

async function updatePdfState(
  job: Pick<PdfJob, "kind" | "session" | "sourceHash">,
  state: PdfStatus,
  values: { filePath?: string; error?: string } = {}
) {
  const fields = pdfFields[job.kind];
  const set: Record<string, unknown> = {
    [fields.status as string]: state,
    [fields.hash as string]: job.sourceHash,
  };

  if (values.filePath) {
    set[fields.filePath as string] = values.filePath;
    set[fields.generatedAt as string] = new Date();
  }

  if (values.error) {
    set[fields.error as string] = values.error.slice(0, 900);
  } else if (state !== "failed") {
    set[fields.error as string] = undefined;
  }

  await LaunchSession.updateOne({ _id: job.session._id }, { $set: set });
}

async function writePdfAtomically(filePath: string, pdf: Buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, pdf);
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function generateAndStorePdf(job: PdfJob): Promise<Buffer> {
  const key = `${job.kind}:${String(job.session._id)}:${job.sourceHash}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const filePath = reportFilePath(job);
    await updatePdfState(job, "pending");

    try {
      const pdf = await job.build();
      await writePdfAtomically(filePath, pdf);
      await updatePdfState(job, "ready", { filePath });
      return pdf;
    } catch (err) {
      await updatePdfState(job, "failed", { error: err instanceof Error ? err.message : String(err) }).catch(() => undefined);
      throw err;
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

function validationJob(session: ILaunchSession): PdfJob {
  const title = `${session.projectTitle || "Business Idea"} - Business Validation Report`;
  const researchText = session.researchText ?? "{}";
  const analysis = JSON.parse(researchText);
  return {
    kind: "businessValidation",
    session,
    title,
    sourceHash: reportSourceHash(title, researchText),
    build: () => buildBusinessValidationPdf(title, analysis),
  };
}

function blueprintJob(session: ILaunchSession): PdfJob {
  const title = `${session.projectTitle || "Business Idea"} - Business Development Blueprint`;
  const technicalDocText = session.technicalDocText ?? "{}";
  const blueprint = JSON.parse(technicalDocText);
  return {
    kind: "businessBlueprint",
    session,
    title,
    sourceHash: reportSourceHash(title, technicalDocText),
    build: () => buildBusinessBlueprintPdf(title, blueprint),
  };
}

async function getOrCreatePdf(job: PdfJob): Promise<Buffer> {
  const cached = await readCachedPdf(job.session, job.kind, job.sourceHash);
  if (cached) return cached;
  return generateAndStorePdf(job);
}

function warmPdf(jobFactory: () => PdfJob) {
  setImmediate(() => {
    let job: PdfJob;
    try {
      job = jobFactory();
    } catch (err) {
      logger.warn({ err }, "Failed to prepare report PDF warmup");
      return;
    }

    void getOrCreatePdf(job).catch((err) => {
      logger.warn({ err, sessionId: job.session._id, kind: job.kind }, "Report PDF warmup failed");
    });
  });
}

export async function getOrCreateBusinessValidationPdf(session: ILaunchSession): Promise<Buffer> {
  return getOrCreatePdf(validationJob(session));
}

export async function getOrCreateBusinessBlueprintPdf(session: ILaunchSession): Promise<Buffer> {
  return getOrCreatePdf(blueprintJob(session));
}

export function warmBusinessValidationPdf(session: ILaunchSession) {
  warmPdf(() => validationJob(session));
}

export function warmBusinessBlueprintPdf(session: ILaunchSession) {
  warmPdf(() => blueprintJob(session));
}
