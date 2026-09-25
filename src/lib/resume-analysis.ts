import "server-only";
import { inflateRawSync } from "node:zlib";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import type { Analysis } from "@/generated/prisma/client";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { scoreAnswers } from "./answer-scoring";
import { asData, parseJsonObject, stringList } from "./llm/json";
import { buildPrompt, DATA_SYSTEM_MESSAGE, getPromptContent } from "./llm/prompts";
import { createLlmClient, type LlmClient, type LlmMessage } from "./llm/provider";
import { readResume, resumeExtension } from "./resumes";
import { combineScores, parseScore } from "./skills";

const logger = getLogger();

/** Maximum resume text length sent to the LLM; longer resumes are truncated. */
export const MAX_RESUME_CHARS = 12_000;

export type AnalyzeFailure = "not_found" | "no_llm" | "no_resume" | "parse_error";
export type AnalyzeResult =
  { ok: true; analysis: Analysis } | { ok: false; reason: AnalyzeFailure };

export interface ResumeAnalysisSummary {
  score: number;
  summary: string | null;
  matchedSkills: string[];
  missingSkills: string[];
}

/** Parse the JSON object a compliant LLM returns in its text response. */
export function parseAnalysisOutput(content: string): ResumeAnalysisSummary | null {
  const parsed = parseJsonObject(content);
  const score = parsed ? parseScore(parsed.score) : null;
  if (!parsed || score === null) {
    logger.warn({ contentSample: content.slice(0, 200) }, "Failed to parse LLM analysis output");
    return null;
  }
  return {
    score,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() || null : null,
    matchedSkills: stringList(parsed.matchedSkills, 30),
    missingSkills: stringList(parsed.missingSkills, 30),
  };
}

/** Re-run analysis on the organisation's request. Only the owner of the listing may trigger it. */
export async function reanalyzeForOrganisation(
  organisationUserId: string,
  applicationId: string,
): Promise<AnalyzeResult> {
  const owned = await getDb().application.findFirst({
    where: {
      id: applicationId,
      opportunity: { organisationProfile: { userId: organisationUserId } },
    },
    select: { id: true },
  });
  if (!owned) return { ok: false, reason: "not_found" };
  return analyzeApplication(applicationId);
}

type PartResult<T> = { ok: true; value: T } | { ok: false; reason: AnalyzeFailure };

/**
 * Score an application: the resume against the listing, and the screening answers (ADR-033).
 * Each part that succeeds replaces its stored result; a part that fails keeps the previous one,
 * so a transient LLM error never wipes a good score. The overall score is always recomputed in
 * code from what is stored. Returns a reason instead of throwing when nothing could be scored.
 */
export async function analyzeApplication(applicationId: string): Promise<AnalyzeResult> {
  const db = getDb();

  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      resumeStorageKey: true,
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
      answers: {
        select: {
          id: true,
          answer: true,
          question: { select: { id: true, prompt: true, position: true } },
        },
      },
    },
  });
  if (!application) return { ok: false, reason: "not_found" };

  const client = createLlmClient();
  if (!client) {
    logger.info({ applicationId }, "Application analysis skipped: no LLM configured");
    return { ok: false, reason: "no_llm" };
  }

  const answers = [...application.answers].sort(
    (a, b) => a.question.position - b.question.position,
  );
  const [resume, scored] = await Promise.all([
    analyzeResumePart(client, application.resumeStorageKey, application.opportunity, applicationId),
    answers.length > 0
      ? scoreAnswers(
          client,
          application.opportunity,
          answers.map((a) => ({
            questionId: a.question.id,
            question: a.question.prompt,
            answer: a.answer,
          })),
        )
      : Promise.resolve(null),
  ]);

  if (!resume.ok && !scored) return { ok: false, reason: resume.reason };

  const previous = await db.analysis.findUnique({ where: { applicationId } });
  const resumeScore = resume.ok ? resume.value.score : (previous?.resumeScore ?? null);
  // A listing without questions has no answers score.
  const answersScore =
    answers.length === 0 ? null : scored ? scored.score : (previous?.answersScore ?? null);
  const data = {
    ...(resume.ok
      ? {
          resumeScore: resume.value.score,
          summary: resume.value.summary,
          matchedSkills: resume.value.matchedSkills,
          missingSkills: resume.value.missingSkills,
        }
      : {}),
    ...(scored ? { answersScore: scored.score, answersSummary: scored.summary } : {}),
    ...(answers.length === 0 ? { answersScore: null, answersSummary: null } : {}),
    overallScore: combineScores(resumeScore, answersScore),
    model: client.model,
    createdAt: new Date(),
  };

  const saved = await db.$transaction(async (tx) => {
    if (scored) {
      for (const answer of answers) {
        const result = scored.perAnswer.get(answer.question.id);
        await tx.applicationAnswer.update({
          where: { id: answer.id },
          data: { score: result?.score ?? null, feedback: result?.feedback ?? null },
        });
      }
    }
    return tx.analysis.upsert({
      where: { applicationId },
      create: { applicationId, ...data },
      update: data,
    });
  });

  logger.info(
    {
      applicationId,
      analysisId: saved.id,
      resumeScore: saved.resumeScore,
      answersScore: saved.answersScore,
      overallScore: saved.overallScore,
      resumeFailure: resume.ok ? undefined : resume.reason,
    },
    "Application analysis completed",
  );
  return { ok: true, analysis: saved };
}

export type ListingForPrompt = {
  title: string;
  type: string;
  description: string;
  skills: string[];
  requirements: string | null;
  experienceLevel: string | null;
};

async function analyzeResumePart(
  client: LlmClient,
  storageKey: string,
  opportunity: ListingForPrompt,
  applicationId: string,
): Promise<PartResult<ResumeAnalysisSummary>> {
  const resumeText = await readResumeText(storageKey);
  if (!resumeText) {
    logger.warn(
      { applicationId },
      "Resume text extraction returned empty; resume analysis unavailable",
    );
    return { ok: false, reason: "no_resume" };
  }

  const prompt = buildPrompt(await getPromptContent("resume_analysis"), {
    title: opportunity.title,
    type: opportunity.type,
    description: opportunity.description,
    skills: opportunity.skills.join(", "),
    requirements: opportunity.requirements ?? "",
    experienceLevel: opportunity.experienceLevel ?? "",
    resumeText: asData("resume", resumeText, MAX_RESUME_CHARS),
  });

  const messages: LlmMessage[] = [
    { role: "system", content: DATA_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ];
  const content = await client.chat(messages);
  if (!content) return { ok: false, reason: "no_llm" };

  const parsed = parseAnalysisOutput(content);
  return parsed ? { ok: true, value: parsed } : { ok: false, reason: "parse_error" };
}

/** Plain text of a stored resume, or null when it can't be read. */
export async function readResumeText(storageKey: string): Promise<string | null> {
  const extension = resumeExtension(storageKey);
  if (!extension) return null;
  try {
    return await extractResumeText(await readResume(storageKey), extension);
  } catch (err) {
    logger.warn({ err, extension }, "Resume text extraction failed");
    return null;
  }
}

/** Extract plain text from a resume file. Returns null when nothing readable is found. */
export async function extractResumeText(
  bytes: Buffer,
  extension: "pdf" | "doc" | "docx",
): Promise<string | null> {
  let text: string | null;
  if (extension === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    text = (await extractPdfText(pdf, { mergePages: true })).text;
  } else if (extension === "docx") {
    text = extractDocxText(bytes);
  } else {
    // Legacy binary DOC has no parser here; keep runs of printable text.
    text = (bytes.toString("latin1").match(/[\x20-\x7e]{4,}/g) ?? []).join("\n");
  }
  const trimmed = text
    ?.replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return trimmed || null;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** DOCX is a ZIP; the body text lives in word/document.xml. Paragraphs become lines. */
function extractDocxText(bytes: Buffer): string | null {
  const xml = readZipEntry(bytes, "word/document.xml")?.toString("utf8");
  if (!xml) return null;
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:(?:tab|br)\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => XML_ENTITIES[name]);
}

/** Minimal ZIP reader: finds one entry through the central directory (stored or deflated). */
function readZipEntry(bytes: Buffer, wanted: string): Buffer | null {
  let eocd = bytes.length - 22;
  while (eocd >= 0 && bytes.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;

  const count = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) return null;
    const compression = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (name === wanted) {
      if (bytes.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const start =
        localOffset +
        30 +
        bytes.readUInt16LE(localOffset + 26) +
        bytes.readUInt16LE(localOffset + 28);
      const data = bytes.subarray(start, start + compressedSize);
      if (compression === 0) return data;
      if (compression === 8) return inflateRawSync(data);
      return null;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
