import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyToOpportunity,
  decideApplication,
  getResumeForUser,
  withdrawApplication,
} from "@/lib/applications";
import { getDb } from "@/lib/db";
import { createOpportunity, changeOpportunityStatus } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";

const EMAIL_DOMAIN = "applications-test.venturepath.local";
const pdf = Buffer.from("%PDF-1.4\n");

async function createUser(role: "student" | "msme", approved = true) {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
      ...(role === "student"
        ? {
            studentProfile: {
              create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
            },
          }
        : {
            msmeProfile: {
              create: {
                businessName: "Acme",
                description: "Tools",
                industry: "Manufacturing",
                location: "Pune",
                status: approved ? "approved" : "pending",
              },
            },
          }),
    },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Marketing intern",
  description: "Social media.",
  skills: [],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 10000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: null,
  experienceLevel: null,
  compensationMin: null,
  compensationMax: null,
};

async function publishedListing(msmeId: string) {
  const created = await createOpportunity(msmeId, listing);
  if (!created.ok) throw new Error(created.reason);
  await changeOpportunityStatus(msmeId, created.id, "publish");
  return created.id;
}

const resume = { fileName: "cv.pdf", extension: "pdf" as const, bytes: pdf };

let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "vp-resumes-"));
  process.env.UPLOAD_DIR = uploadDir;
});

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("applications", () => {
  it("applies once, withdraws, and applies again", async () => {
    const msme = await createUser("msme");
    const student = await createUser("student");
    const opportunityId = await publishedListing(msme.id);

    const first = await applyToOpportunity(student.id, opportunityId, { ...resume, note: "Hello" });
    expect(first.ok).toBe(true);
    expect(await applyToOpportunity(student.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "already_applied",
    });

    if (!first.ok) return;
    expect(await withdrawApplication(student.id, first.id)).toEqual({ ok: true });
    const again = await applyToOpportunity(student.id, opportunityId, { ...resume, note: "Again" });
    expect(again).toEqual({ ok: true, id: first.id });
  });

  it("refuses a closed listing and a student without a profile", async () => {
    const msme = await createUser("msme");
    const student = await createUser("student");
    const bare = await getDb().user.create({
      data: {
        id: randomUUID(),
        name: "Bare",
        email: `${randomUUID()}@${EMAIL_DOMAIN}`,
        role: "student",
      },
    });
    const opportunityId = await publishedListing(msme.id);
    await changeOpportunityStatus(msme.id, opportunityId, "close");

    expect(await applyToOpportunity(student.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "not_open",
    });
    expect(await applyToOpportunity(bare.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "needs_profile",
    });
  });

  it("lets only the student and the owning MSME read the resume, and only the MSME decide", async () => {
    const msme = await createUser("msme");
    const other = await createUser("msme");
    const student = await createUser("student");
    const stranger = await createUser("student");
    const opportunityId = await publishedListing(msme.id);
    const applied = await applyToOpportunity(student.id, opportunityId, { ...resume, note: "" });
    if (!applied.ok) throw new Error(applied.reason);

    expect(await getResumeForUser(student.id, applied.id)).not.toBeNull();
    expect(await getResumeForUser(msme.id, applied.id)).not.toBeNull();
    expect(await getResumeForUser(stranger.id, applied.id)).toBeNull();
    expect(await decideApplication(other.id, applied.id, "accepted")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    expect(await decideApplication(msme.id, applied.id, "accepted")).toEqual({ ok: true });
    expect(await withdrawApplication(student.id, applied.id)).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });
});
