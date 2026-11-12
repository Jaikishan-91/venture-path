import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
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

test("organisation builds a pipeline, schedules the candidate, makes an offer; the student accepts", async ({
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
    // Wait for the save (and any AI assist) to finish before leaving the page.
    await page.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 60_000 });
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
    // The AI interviewer is a stage kind now (docs/PRODUCT.md Module 5), not a disabled option.
    await expect(
      step1.getByLabel("Kind").locator("option", { hasText: "AI interview" }),
    ).toHaveCount(1);

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

    // Organisation: the board shows the candidate at Applied with one next step.
    const boardUrl = `/organisation/opportunities/${opportunityId}/applicants`;
    await page.goto(boardUrl);
    await expect(page.getByRole("link", { name: /^Applied\s*1$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const row = page.getByRole("listitem", { name: "E2E user" });
    await row.getByRole("button", { name: "Move to Interview" }).click();
    await expect(toast(page, "Candidate moved to the next step.")).toBeVisible();

    // Candidate page: schedule the live interview.
    await page
      .getByRole("listitem", { name: "E2E user" })
      .getByRole("link", { name: "E2E user" })
      .click();
    await expect(page).toHaveURL(/\/applicants\/[^/?]+/);
    const scheduleForm = page.getByRole("form", { name: "Schedule an interview or test" });
    await scheduleForm.getByLabel("Start").fill(tomorrowIstLocal());
    await scheduleForm
      .getByLabel("Interviewers")
      .selectOption({ label: "E2E organisation (Owner)" });
    await scheduleForm.getByRole("button", { name: "Schedule" }).click();
    await expect(toast(page, "Interview scheduled.")).toBeVisible();
    const live = page.getByRole("region", { name: "Live interview" });
    await expect(live).toContainText("Calendar not configured");
    await expect(live.getByRole("link", { name: "Join Google Meet" })).toHaveCount(0);
    await expect(live).toContainText("E2E organisation");
    const candidateUrl = page.url();

    // Candidate: sees the upcoming interview, no Meet link.
    await user.goto("/user/applications");
    await expect(user.getByText(/Interview \(Interview\)/)).toBeVisible();
    await expect(user.getByRole("link", { name: "Join Google Meet" })).toHaveCount(0);

    // Organisation: one action bar. Move to Test; the last step offers "Make offer" (no Accept).
    const bar = page.getByRole("region", { name: "Decide" });
    await bar.getByRole("button", { name: "Move to Test" }).click();
    await expect(toast(page, "Candidate moved to the next step.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await bar.getByRole("button", { name: "Make offer" }).click();
    const dialog = page.getByRole("dialog", { name: "Make offer" });
    await dialog.getByLabel("Message to the student").fill("Welcome aboard! Start with our app.");
    await dialog.getByLabel("Stipend (₹ / month, optional)").fill("12000");
    await dialog.getByRole("button", { name: "Send offer" }).click();
    await expect(toast(page, /Offer sent/)).toBeVisible();
    await expect(bar).toContainText("Waiting for the student to answer.");

    // Student: offer card with Accept / Decline and a confirm step.
    await user.goto("/user/applications");
    const offerCard = user.getByRole("region", { name: "Your offer" });
    await expect(offerCard).toContainText("Welcome aboard! Start with our app.");
    await expect(offerCard).toContainText("₹12,000 / month");
    await offerCard.getByRole("button", { name: "Accept" }).click();
    await offerCard.getByRole("button", { name: "Yes, accept" }).click();
    await expect(toast(user, /you're hired/)).toBeVisible();
    await expect(user.getByText("Hired", { exact: true })).toBeVisible();

    // Organisation: the candidate is on the Hired tab and their email is visible.
    await page.goto(candidateUrl);
    await expect(page.getByText(`Email: ${userEmail}`)).toBeVisible();
    await page.goto(`${boardUrl}?tab=hired`);
    await expect(page.getByRole("listitem", { name: "E2E user" })).toBeVisible();

    // Responsive: pipeline editor and applicants panel at 320px, no horizontal scroll.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/organisation/opportunities/${opportunityId}/edit`);
    await expectNoHorizontalScroll(page);
    await page.goto(boardUrl);
    await expectNoHorizontalScroll(page);
    await page.goto(candidateUrl);
    await expectNoHorizontalScroll(page);
  } finally {
    await rm(resume, { force: true });
  }
});
