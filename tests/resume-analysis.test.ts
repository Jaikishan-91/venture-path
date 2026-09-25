import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyToOpportunity } from "@/lib/applications";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { changeOpportunityStatus, createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import {
  analyzeApplication,
  extractResumeText,
  reanalyzeForOrganisation,
} from "@/lib/resume-analysis";

const EMAIL_DOMAIN = "resume-analysis-test.venturepath.local";

/** A one-page PDF whose content stream draws `text`, with a correct xref table. */
function pdfWithText(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

/** A ZIP holding only word/document.xml, deflated — enough for the DOCX reader. */
function docxWithParagraphs(paragraphs: string[]): Buffer {
  const xml = Buffer.from(
    `<?xml version="1.0"?><w:document><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  );
  const name = Buffer.from("word/document.xml");
  const data = deflateRawSync(xml);
  const crc = crc32(xml);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, data, central, name, end]);
}

async function createUser(role: "user" | "organisation") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
      ...(role === "user"
        ? {
            userProfile: {
              create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
            },
          }
        : {
            organisationProfile: {
              create: {
                businessName: "Acme",
                description: "Tools",
                industry: "Manufacturing",
                location: "Pune",
                status: "approved",
              },
            },
          }),
    },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Frontend intern",
  description: "Build pages.",
  skills: ["react"],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 10000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: "Portfolio",
  experienceLevel: "entry",
  compensationMin: null,
  compensationMax: null,
};

/** Apply with the LLM disabled (so no background analysis), then enable the stubbed LLM. */
async function applicationWithPdf(text: string) {
  const organisation = await createUser("organisation");
  const user = await createUser("user");
  const created = await createOpportunity(organisation.id, listing);
  if (!created.ok) throw new Error(created.reason);
  await changeOpportunityStatus(organisation.id, created.id, "publish");
  const applied = await applyToOpportunity(user.id, created.id, {
    fileName: "cv.pdf",
    extension: "pdf",
    bytes: pdfWithText(text),
    note: "",
  });
  if (!applied.ok) throw new Error(applied.reason);
  await settleBackground();
  return { organisationId: organisation.id, applicationId: applied.id };
}

function stubLlm(reply: object) {
  const fetchMock = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, {
    LLM_PROVIDER: "openai",
    LLM_BASE_URL: "http://llm.test/v1",
    LLM_MODEL: "test-model",
  });
  clearLlmConfigCache();
  return fetchMock;
}

let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "vp-resumes-"));
  process.env.UPLOAD_DIR = uploadDir;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.LLM_PROVIDER = "disabled";
  clearLlmConfigCache();
});

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("extractResumeText", () => {
  it("reads text from a PDF", async () => {
    expect(await extractResumeText(pdfWithText("React developer"), "pdf")).toContain(
      "React developer",
    );
  });

  it("reads paragraphs from a DOCX and decodes entities", async () => {
    const text = await extractResumeText(docxWithParagraphs(["Skills", "React &amp; SQL"]), "docx");
    expect(text).toBe("Skills\nReact & SQL");
  });

  it("keeps every printable run from a binary DOC", async () => {
    const doc = Buffer.concat([
      Buffer.from([0, 1, 2]),
      Buffer.from("First part"),
      Buffer.from([0, 0]),
      Buffer.from("Second part"),
    ]);
    expect(await extractResumeText(doc, "doc")).toBe("First part\nSecond part");
  });
});

describe("analyzeApplication (resume only)", () => {
  it("reports no_llm when the provider is disabled", async () => {
    const { applicationId } = await applicationWithPdf("React developer");
    expect(await analyzeApplication(applicationId)).toEqual({ ok: false, reason: "no_llm" });
  });

  it("stores the analysis, then replaces it on re-analysis", async () => {
    const { organisationId, applicationId } = await applicationWithPdf("React developer");

    const fetchMock = stubLlm({ score: 81.4, summary: "Strong", matchedSkills: ["react"] });
    const first = await analyzeApplication(applicationId);
    expect(first).toMatchObject({
      ok: true,
      analysis: { resumeScore: 81, overallScore: 81, model: "test-model" },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://llm.test/v1/chat/completions");
    const body = JSON.parse(init.body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("<resume>\nReact developer\n</resume>");
    expect(body.messages[1].content).toContain("Frontend intern");

    stubLlm({ score: 50, summary: "Retry", missingSkills: ["sql"] });
    const second = await reanalyzeForOrganisation(organisationId, applicationId);
    expect(second).toMatchObject({
      ok: true,
      analysis: { resumeScore: 50, overallScore: 50, missingSkills: ["sql"] },
    });
    expect(await getDb().analysis.count({ where: { applicationId } })).toBe(1);
  });

  it("refuses re-analysis by an organisation that doesn't own the listing", async () => {
    const { applicationId } = await applicationWithPdf("React developer");
    const other = await createUser("organisation");
    const fetchMock = stubLlm({ score: 90 });
    expect(await reanalyzeForOrganisation(other.id, applicationId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports parse_error and stores nothing for a non-JSON reply", async () => {
    const { applicationId } = await applicationWithPdf("React developer");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ choices: [{ message: { content: "Looks good!" } }] })),
    );
    Object.assign(process.env, { LLM_PROVIDER: "openai", LLM_BASE_URL: "http://llm.test/v1" });
    clearLlmConfigCache();
    expect(await analyzeApplication(applicationId)).toEqual({ ok: false, reason: "parse_error" });
    expect(await getDb().analysis.count({ where: { applicationId } })).toBe(0);
  });
});
