import "server-only";
import { getDb } from "./db";
import { getLogger } from "./logger";
import type { Analysis } from "@/generated/prisma/client";
import { buildPrompt, getPromptContent } from "./llm/prompts";
import type { LlmMessage } from "./llm/provider";
import { createLlmClient } from "./llm/provider";
import { readResume } from "./resumes";

const logger = getLogger();

/** Maximum resume text length sent to the LLM; longer resumes are truncated. */
const MAX_RESUME_CHARS = 12_000;

export type AnalyzeResult = { ok: true; analysis: Analysis } | { ok: false; reason: "no_llm" | "no_resume" | "parse_error" };

export interface ResumeAnalysisSummary {
  score: number;
  summary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
}

/** Parse the JSON object a compliant LLM returns in its text response. */
export function parseAnalysisOutput(content: string): ResumeAnalysisSummary | null {
  try {
    const parsed = JSON.parse(content.trim().replace(/```json\n?|\n?```/g, "")) as Record<string, unknown>;
    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
    if (!(score >= 0 && score <= 100)) return null;

    return {
      score,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : null,
      matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills.map(String) : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills.map(String) : [],
    };
  } catch {
    logger.warn({ contentSample: content.slice(0, 200) }, "Failed to parse LLM analysis output");
    return null;
  }
}

/**
 * Analyze a student's resume against the opportunity they applied to.
 * Returns null-ish results when the LLM is unconfigured or the resume can't be read,
 * so the UI degrades gracefully.
 */
export async function analyzeResume(applicationId: string): Promise<AnalyzeResult> {
  const db = getDb();

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      opportunity: {
        select: {
          title: true,
          type: true,
          description: true,
          skills: true,
          requirements: true,
          experienceLevel: true,
        },
      },
      studentProfile: { select: { skills: true, institution: true, course: true, bio: true } },
    },
  });
  if (!application) return { ok: false, reason: "no_resume" };

  const client = createLlmClient();
  if (!client) {
    logger.info({ applicationId, model: "disabled" }, "Resume analysis skipped: no LLM configured");
    return { ok: false, reason: "no_llm" };
  }

  // Extract resume text. PDFs and binary DOCX aren't parseable without libraries we don't have.
  const resumeText = await extractResumeText(application.resumeStorageKey);
  if (!resumeText) {
    logger.warn({ applicationId }, "Resume text extraction returned empty; analysis unavailable");
    return { ok: false, reason: "no_resume" };
  }

  const prompt = await getPromptContent("resume_analysis");
  const vars: Record<string, string> = {
    title: application.opportunity.title,
    type: application.opportunity.type,
    description: application.opportunity.description,
    skills: application.opportunity.skills.join(", "),
    requirements: application.opportunity.requirements ?? "",
    experienceLevel: application.opportunity.experienceLevel ?? "",
    resumeText: resumeText.slice(0, MAX_RESUME_CHARS),
  };
  const renderedPrompt = buildPrompt(prompt, vars);

  const messages: LlmMessage[] = [{ role: "user", content: renderedPrompt }];
  const content = await client.chat(messages);
  if (!content) return { ok: false, reason: "no_llm" };

  const parsed = parseAnalysisOutput(content);
  if (!parsed) return { ok: false, reason: "parse_error" };

  const created = await db.analysis.create({
    data: {
      applicationId: application.id,
      score: parsed.score,
      summary: parsed.summary,
      matchedSkills: parsed.matchedSkills,
      missingSkills: parsed.missingSkills,
      model: client.model,
    },
  });

  logger.info(
    { applicationId, analysisId: created.id, score: parsed.score },
    "Resume analysis completed",
  );
  return { ok: true, analysis: created };
}

/**
 * Extract text from a resume file.
 * Supports plain-text DOCX (XML text nodes) via unzip. PDF parsing requires a native
 * dependency not present in this environment — returns null for PDFs so analysis degrades
 * gracefully. Recorded as a known limitation in the plan.
 */
async function extractResumeText(storageKey: string): Promise<string | null> {
  const bytes = await readResume(storageKey);

  // DOCX is a ZIP. We try to decompress with Node's zlib if the file contains
  // a central directory; otherwise we fall back to scanning for plain text.
  const ext = storageKey.slice(storageKey.lastIndexOf(".") + 1).toLowerCase();

  if (ext === "docx") {
    return extractDocxText(bytes);
  }

  if (ext === "doc") {
    // Legacy binary DOC — can't parse without a library; scan for Latin-1 text.
    return extractPlainTextFromBinary(bytes);
  }

  if (ext === "pdf") {
    // PDF parsing requires `pdf-parse` or similar native dependency.
    logger.warn("PDF text extraction is not supported in this environment");
    return null;
  }

  return extractPlainTextFromBinary(bytes);
}

/** Minimal DOCX text extraction: unzip and parse document.xml word/text elements. */
function extractDocxText(bytes: Buffer): string | null {
  try {
    // A DOCX is a ZIP; use the built-in zlib unzip if the bytes start with the ZIP local-file header.
    // We implement a minimal ZIP reader inline so we don't add a dependency.
    const zip = minizip(bytes);
    const docXml = zip.read("word/document.xml");
    if (!docXml) return null;

    // Extract text from <w:t> elements.
    const text = docXml.toString("utf8").match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (!text || text.length === 0) return null;

    return text
      .map((match) => match.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, "$1"))
      .filter(Boolean)
      .join("\n")
      .trim();
  } catch (err) {
    logger.warn({ err }, "DOCX extraction failed");
    return null;
  }
}

/** Fallback: scan raw bytes for printable ASCII text (for DOC or unknown formats). */
function extractPlainTextFromBinary(bytes: Buffer): string | null {
  // Pull out sequences of printable ASCII characters.
  const matches = bytes
    .toString("latin1")
    .match(/[\x20-\x7e]{4,}/)
  if (!matches || matches.length === 0) return null;
  return matches.join("\n").trim() || null;
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (enough for .docx central directory + deflate)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  offset: number;
  size: number;
  compression: number;
}

function minizip(bytes: Buffer): { read: (name: string) => Buffer | null } {
  // Find End of Central Directory record.
  const eocdSig = 0x06054b50;
  let eocd = bytes.length - 22;
  while (eocd >= 0) {
    if (bytes.readUInt32LE(eocd) === eocdSig) break;
    eocd--;
  }
  if (eocd < 0) throw new Error("ZIP EOCD not found");

  const centralCount = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < centralCount; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) break;

    const compression = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLen = bytes.readUInt16LE(cursor + 28);
    const extraLen = bytes.readUInt16LE(cursor + 30);
    const commentLen = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLen);

    entries.push({
      name,
      offset: localOffset,
      size: compression === 0 ? uncompressedSize : compressedSize,
      compression,
    });

    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return {
    read(name: string): Buffer | null {
      const entry = entries.find((e) => e.name === name);
      if (!entry) return null;

      const localSig = bytes.readUInt32LE(entry.offset);
      if (localSig !== 0x04034b50) return null;

      const localNameLen = bytes.readUInt16LE(entry.offset + 28);
      const localExtraLen = bytes.readUInt16LE(entry.offset + 30);
      const dataOffset = entry.offset + 30 + localNameLen + localExtraLen;

      const compressed = bytes.subarray(dataOffset, dataOffset + (entry.size ?? 0));

      if (entry.compression === 0) return compressed;
      if (entry.compression === 8) {
        return decompressRaw(compressed);
      }
      return null;
    },
  };
}

// Raw deflate decompression using Node's zlib (windowBits = -15 for raw deflate).
import { inflateRawSync } from "node:zlib";
function decompressRaw(data: Buffer): Buffer {
  return Buffer.from(inflateRawSync(data));
}
