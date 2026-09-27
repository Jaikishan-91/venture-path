import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createPendingOrganisation,
  setOrganisationStatus,
  signUpVerified,
  toast,
  uniqueEmail,
} from "./helpers";

/** `YYYY-MM-DDTHH:mm` for tomorrow at `hour` IST, for a `datetime-local` input (D7). */
function tomorrowIstLocal(hour = 10): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Opens the collapsed "Pipeline & scheduling" panel on an applicant card, if not already open. */
async function openPipelinePanel(card: Locator) {
  const summary = card.getByText("Pipeline & scheduling");
  if (await summary.isVisible()) await summary.click();
}

test("organisation builds a pipeline, candidate is scheduled and progressed to accepted", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const organisationEmail = uniqueEmail("pipeline-organisation");
  const userEmail = uniqueEmail("pipeline-user");
  const title = `Pipeline role ${randomUUID().slice(0, 8)}`;
  const resume = path.join(tmpdir(), `resume-${randomUUID()}.pdf`);
  await writeFile(resume, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF");

  try {
    // Organisation: create, publish a listing, and build a 2-stage pipeline.
    await createPendingOrganisation(
      page,
      organisationEmail,
      `Pipeline Co ${randomUUID().slice(0, 8)}`,
    );
    await setOrganisationStatus(organisationEmail, "approved");
    await page.goto("/organisation/opportunities/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Help us ship product features.");
    await page.getByLabel("Amount (₹)").fill("10000");
    // Save-as-draft redirects to the listing page, or (when the AI assist adds skills/questions)
    // straight to the edit page; either way, go to the listing page to publish.
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.goto("/organisation/opportunities");
    const article = page.getByRole("article", { name: title });
    await article.getByRole("button", { name: "Publish" }).click();
    await expect(article).toContainText("Published");

    await article.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    const opportunityId = /opportunities\/([^/]+)\/edit/.exec(page.url())?.[1];
    if (!opportunityId) throw new Error("Could not read the opportunity id from the URL");

    await page.getByRole("button", { name: "Add stage" }).click();
    await page.getByRole("button", { name: "Add stage" }).click();

    const step1 = page.getByRole("listitem").filter({ hasText: "Step 1" });
    await step1.getByLabel("Name").fill("Interview");
    await expect(
      step1.getByRole("radio", { name: "AI Hiring Manager — coming soon" }),
    ).toBeDisabled();

    const step2 = page.getByRole("listitem").filter({ hasText: "Step 2" });
    await step2.getByLabel("Name").fill("Test");
    await step2.getByLabel("Kind").selectOption("test");

    await page.getByRole("button", { name: "Save pipeline" }).click();
    await expect(toast(page, "Pipeline saved.")).toBeVisible();

    // Reload: the pipeline persisted.
    await page.reload();
    const step1Reloaded = page.getByRole("listitem").filter({ hasText: "Step 1" });
    const step2Reloaded = page.getByRole("listitem").filter({ hasText: "Step 2" });
    await expect(step1Reloaded.getByLabel("Name")).toHaveValue("Interview");
    await expect(step1Reloaded.getByLabel("Kind")).toHaveValue("interview");
    await expect(step2Reloaded.getByLabel("Name")).toHaveValue("Test");
    await expect(step2Reloaded.getByLabel("Kind")).toHaveValue("test");

    // User: profile, then apply with a resume.
    const user = await (await browser.newContext()).newPage();
    await signUpVerified(user, "user", userEmail);
    await user.goto("/user/profile");
    await user.getByLabel("Institution").fill("IIT Bombay");
    await user.getByLabel("Course").fill("B.Tech");
    await user.getByLabel("Graduation year").fill("2027");
    await user.getByRole("button", { name: "Save profile" }).click();
    await user.goto("/opportunities?q=" + encodeURIComponent(title));
    await user.getByRole("link", { name: new RegExp(title) }).click();
    await user.getByLabel("Resume file").setInputFiles(resume);
    // The AI assist may have drafted screening questions on this listing; answer any that exist.
    const answerFields = user.locator('textarea[name^="answer:"]');
    const answerCount = await answerFields.count();
    for (let i = 0; i < answerCount; i++) {
      await answerFields.nth(i).fill("A relevant example from my coursework and projects.");
    }
    await user.getByRole("button", { name: "Apply" }).click();
    await expect(user.getByText("waiting for a decision")).toBeVisible();

    // Organisation: applicants page shows the pipeline panel; advance to Interview and schedule.
    await page.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    const card = page.getByRole("article", { name: "E2E user" });
    await expect(card).toContainText("Applied");

    await openPipelinePanel(card);
    await card.getByRole("button", { name: "Advance to Interview" }).click();
    await expect(toast(page, "Candidate advanced to the next stage.")).toBeVisible();
    await expect(card).toContainText("Interview");

    await openPipelinePanel(card);
    const scheduleForm = card.getByRole("form", { name: "Schedule an interview or test" });
    await scheduleForm.getByLabel("Start").fill(tomorrowIstLocal());
    await scheduleForm.getByLabel("Interviewers").selectOption({ label: "E2E organisation (Owner)" });
    await scheduleForm.getByRole("button", { name: "Schedule" }).click();
    await expect(toast(page, "Interview scheduled.")).toBeVisible();

    await openPipelinePanel(card);
    await expect(card).toContainText("Calendar not configured");
    await expect(card.getByRole("link", { name: "Join Google Meet" })).toHaveCount(0);
    await expect(card).toContainText("E2E organisation");

    // Candidate: sees the upcoming interview, no Meet link.
    await user.goto("/user/applications");
    await expect(user.getByText(/Interview \(Interview\)/)).toBeVisible();
    await expect(user.getByRole("link", { name: "Join Google Meet" })).toHaveCount(0);

    // Organisation: advance through the last stage; the application is accepted.
    await openPipelinePanel(card);
    await card.getByRole("button", { name: "Advance to Test" }).click();
    await expect(toast(page, "Candidate advanced to the next stage.")).toBeVisible();
    await expect(card).toContainText("Test");

    await openPipelinePanel(card);
    await card.getByRole("button", { name: "Pass final stage & accept" }).click();
    await expect(
      toast(page, "Candidate passed the final stage and was accepted."),
    ).toBeVisible();
    await expect(card).toContainText("Accepted");
    await expect(card).toContainText(userEmail);

    // Responsive: pipeline editor and applicants panel at 320px, no horizontal scroll.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/organisation/opportunities/${opportunityId}/edit`);
    await expectNoHorizontalScroll(page);
    await page.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    await expectNoHorizontalScroll(page);
  } finally {
    await rm(resume, { force: true });
  }
});
