import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import type { StageInput } from "@/lib/hiring/types";
import {
  getOrderedStages,
  getPipeline,
  getPipelineTemplate,
  listPipelineSources,
  savePipeline,
} from "@/lib/pipelines";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "pipelines-test.venturepath.local";

async function createOrganisation(status: OrganisationStatus = "approved") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme",
          description: "Tools",
          industry: "Manufacturing",
          location: "Pune",
          status,
        },
      },
    },
  });
}

async function createCandidate() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test candidate",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Marketing intern",
  description: "Social media.",
  skills: ["canva"],
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

async function createListing(userId: string) {
  const result = await createOpportunity(userId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function createApplication(opportunityId: string, currentStageId: string | null = null) {
  const candidate = await createCandidate();
  return getDb().application.create({
    data: {
      opportunityId,
      userProfileId: candidate.userProfile!.id,
      resumeFileName: "cv.pdf",
      resumeStorageKey: `${randomUUID()}.pdf`,
      currentStageId,
    },
  });
}

function stage(overrides: Partial<StageInput> = {}): StageInput {
  return {
    name: "Screen",
    kind: "interview",
    instructions: null,
    externalUrl: null,
    durationMinutes: 45,
    source: "organisation",
    ...overrides,
  };
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("getPipeline", () => {
  it("returns an empty pipeline for a listing with none", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    expect(await getPipeline(organisation.id, id)).toEqual({ stages: [], version: "0:" });
  });

  it("returns null for another organisation's listing", async () => {
    const owner = await createOrganisation();
    const other = await createOrganisation();
    const id = await createListing(owner.id);
    expect(await getPipeline(other.id, id)).toBeNull();
  });
});

describe("savePipeline", () => {
  it("creates, reorders and deletes stages, keeping positions 0..n-1", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);

    const created = await savePipeline(
      organisation.id,
      id,
      [stage({ name: "Screen" }), stage({ name: "Onsite", kind: "test" })],
      "0:",
    );
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error(created.reason);

    const afterCreate = await getPipeline(organisation.id, id);
    expect(afterCreate?.stages.map((s) => [s.name, s.position])).toEqual([
      ["Screen", 0],
      ["Onsite", 1],
    ]);
    const [screen, onsite] = afterCreate!.stages;

    // Reorder: swap the two stages.
    const reordered = await savePipeline(
      organisation.id,
      id,
      [
        { ...stage({ name: onsite.name, kind: onsite.kind }), id: onsite.id },
        { ...stage({ name: screen.name, kind: screen.kind }), id: screen.id },
      ],
      afterCreate!.version,
    );
    expect(reordered).toMatchObject({ ok: true });
    const afterReorder = await getPipeline(organisation.id, id);
    expect(afterReorder?.stages.map((s) => [s.name, s.position])).toEqual([
      ["Onsite", 0],
      ["Screen", 1],
    ]);

    // Delete one stage.
    const deleted = await savePipeline(
      organisation.id,
      id,
      [{ ...stage({ name: onsite.name, kind: onsite.kind }), id: onsite.id }],
      afterReorder!.version,
    );
    expect(deleted).toMatchObject({ ok: true });
    const afterDelete = await getPipeline(organisation.id, id);
    expect(afterDelete?.stages.map((s) => [s.name, s.position])).toEqual([["Onsite", 0]]);
  });

  it("refuses a stale version", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const first = await getPipeline(organisation.id, id);
    await savePipeline(organisation.id, id, [stage()], first!.version);

    // Saving again with the now-stale version is refused.
    expect(
      await savePipeline(organisation.id, id, [stage({ name: "Other" })], first!.version),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses another organisation's listing", async () => {
    const owner = await createOrganisation();
    const other = await createOrganisation();
    const id = await createListing(owner.id);
    expect(await savePipeline(other.id, id, [stage()], "0:")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("refuses writes for a non-approved organisation", async () => {
    const organisation = await createOrganisation("pending");
    // A pending organisation can't create listings either, so seed one directly.
    const opportunity = await getDb().opportunity.create({
      data: {
        ...listing,
        organisationProfileId: (
          await getDb().organisationProfile.findUniqueOrThrow({
            where: { userId: organisation.id },
          })
        ).id,
      },
    });
    expect(await savePipeline(organisation.id, opportunity.id, [stage()], "0:")).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("refuses invalid stage input", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const result = await savePipeline(organisation.id, id, [stage({ name: "" })], "0:");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("can't delete a stage that holds a candidate (currentStageId)", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const first = await getPipeline(organisation.id, id);
    await savePipeline(
      organisation.id,
      id,
      [stage({ name: "Screen" }), stage({ name: "Onsite" })],
      first!.version,
    );
    const withStages = await getPipeline(organisation.id, id);
    const [screen, onsite] = withStages!.stages;
    await createApplication(id, screen.id);

    const reached = await getPipeline(organisation.id, id);
    expect(reached?.stages.find((s) => s.id === screen.id)?.reached).toBe(true);

    const result = await savePipeline(
      organisation.id,
      id,
      [{ ...stage({ name: onsite.name }), id: onsite.id }],
      reached!.version,
    );
    expect(result).toMatchObject({ ok: false, reason: "locked_stage" });
  });

  it("can't delete a stage with StageEvent history even without a current candidate", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const first = await getPipeline(organisation.id, id);
    await savePipeline(
      organisation.id,
      id,
      [stage({ name: "Screen" }), stage({ name: "Onsite" })],
      first!.version,
    );
    const withStages = await getPipeline(organisation.id, id);
    const [screen, onsite] = withStages!.stages;

    const application = await createApplication(id, null);
    await getDb().stageEvent.create({
      data: { applicationId: application.id, stageId: screen.id, outcome: "moved" },
    });

    const reached = await getPipeline(organisation.id, id);
    expect(reached?.stages.find((s) => s.id === screen.id)?.reached).toBe(true);
    expect(reached?.stages.find((s) => s.id === screen.id)?.candidateCount).toBe(0);

    const result = await savePipeline(
      organisation.id,
      id,
      [{ ...stage({ name: onsite.name }), id: onsite.id }],
      reached!.version,
    );
    expect(result).toMatchObject({ ok: false, reason: "locked_stage" });
  });

  it("keeps the ai source only while the stage is unchanged", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const first = await getPipeline(organisation.id, id);
    await savePipeline(
      organisation.id,
      id,
      [stage({ name: "Screen", source: "ai" })],
      first!.version,
    );
    const created = await getPipeline(organisation.id, id);
    expect(created?.stages[0].source).toBe("ai");

    // Saved unchanged: still ai.
    const unchanged = await savePipeline(
      organisation.id,
      id,
      [{ ...stage({ name: "Screen", source: "ai" }), id: created!.stages[0].id }],
      created!.version,
    );
    expect(unchanged).toMatchObject({ ok: true });
    const afterUnchanged = await getPipeline(organisation.id, id);
    expect(afterUnchanged?.stages[0].source).toBe("ai");

    // Edited name: becomes organisation, even if the client still claims "ai".
    const edited = await savePipeline(
      organisation.id,
      id,
      [{ ...stage({ name: "Phone screen", source: "ai" }), id: afterUnchanged!.stages[0].id }],
      afterUnchanged!.version,
    );
    expect(edited).toMatchObject({ ok: true });
    const afterEdit = await getPipeline(organisation.id, id);
    expect(afterEdit?.stages[0].source).toBe("organisation");
  });
});

describe("listPipelineSources / getPipelineTemplate", () => {
  it("lists own listings with stages, excluding the given one, and copies as a template", async () => {
    const organisation = await createOrganisation();
    const other = await createOrganisation();
    const withStages = await createListing(organisation.id);
    const withoutStages = await createListing(organisation.id);
    const excluded = await createListing(organisation.id);
    const othersListing = await createListing(other.id);

    const first = await getPipeline(organisation.id, withStages);
    await savePipeline(
      organisation.id,
      withStages,
      [stage({ name: "Screen", source: "ai" }), stage({ name: "Onsite", kind: "test" })],
      first!.version,
    );
    const excludedPipeline = await getPipeline(organisation.id, excluded);
    await savePipeline(
      organisation.id,
      excluded,
      [stage({ name: "Only here" })],
      excludedPipeline!.version,
    );
    const othersPipeline = await getPipeline(other.id, othersListing);
    await savePipeline(
      other.id,
      othersListing,
      [stage({ name: "Theirs" })],
      othersPipeline!.version,
    );

    const sources = await listPipelineSources(organisation.id, excluded);
    expect(sources.map((s) => s.id).sort()).toEqual([withStages].sort());
    expect(sources[0]).toMatchObject({ id: withStages, stageCount: 2 });
    expect(sources.some((s) => s.id === withoutStages)).toBe(false);
    expect(sources.some((s) => s.id === othersListing)).toBe(false);

    const template = await getPipelineTemplate(organisation.id, withStages);
    expect(template).toEqual([
      {
        name: "Screen",
        kind: "interview",
        instructions: null,
        externalUrl: null,
        durationMinutes: 45,
        source: "organisation",
      },
      {
        name: "Onsite",
        kind: "test",
        instructions: null,
        externalUrl: null,
        durationMinutes: 45,
        source: "organisation",
      },
    ]);

    // Another organisation's listing can't be used as a template.
    expect(await getPipelineTemplate(organisation.id, othersListing)).toEqual([]);
  });
});

describe("getOrderedStages", () => {
  it("returns stages ordered by position without checking ownership", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const first = await getPipeline(organisation.id, id);
    await savePipeline(
      organisation.id,
      id,
      [stage({ name: "Screen" }), stage({ name: "Onsite" })],
      first!.version,
    );
    const ordered = await getOrderedStages(id);
    expect(ordered.map((s) => s.name)).toEqual(["Screen", "Onsite"]);
  });
});
