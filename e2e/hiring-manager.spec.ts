import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  createPendingOrganisation,
  getEmailText,
  getVerificationLink,
  PASSWORD,
  setOrganisationStatus,
  signUpVerified,
  toast,
  uniqueEmail,
} from "./helpers";

function tomorrowIstLocal(hour = 11): string {
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

async function openPipelinePanel(card: Locator) {
  const summary = card.getByText("Pipeline & scheduling");
  if (await summary.isVisible()) await summary.click();
}

/**
 * Invites a hiring manager from an already-approved organisation's `/organisation/team` page,
 * reads the invite email from Mailpit, signs up with the invited (fixed) email, verifies via the
 * Mailpit link, and accepts the invite. Returns a fresh, signed-in page for that hiring manager.
 */
async function inviteAndAcceptHiringManager(
  browser: Browser,
  orgPage: Page,
  name: string,
  email: string,
): Promise<Page> {
  await orgPage.goto("/organisation/team");
  await orgPage.getByLabel("Name").fill(name);
  await orgPage.getByLabel("Email").fill(email);
  await orgPage.getByRole("button", { name: "Send invite" }).click();
  await expect(toast(orgPage, `Invite sent to ${email}.`)).toBeVisible();

  const emailText = await getEmailText(email, "You're invited to join");
  const inviteLink = emailText.match(/https?:\/\/\S+\/invite\/\S+/)?.[0];
  if (!inviteLink) throw new Error(`No invite link found in the email to ${email}`);

  const hmPage = await (await browser.newContext()).newPage();
  await hmPage.goto(inviteLink);
  await hmPage.getByLabel("Password").fill(PASSWORD);
  await hmPage.getByLabel("Confirm password").fill(PASSWORD);
  await hmPage.getByRole("button", { name: "Create account" }).click();
  await expect(hmPage.getByText("Check your inbox")).toBeVisible();

  await hmPage.goto(await getVerificationLink(email));
  await expect(hmPage.getByRole("button", { name: "Accept invite" })).toBeVisible();
  await hmPage.getByRole("button", { name: "Accept invite" }).click();
  await expect(hmPage).toHaveURL(/\/hiring-manager$/, { timeout: 15_000 });
  return hmPage;
}

test("hiring manager: invited, assigned an interview, sees it, and is deactivated", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const organisationEmail = uniqueEmail("hm-organisation");
  const userEmail = uniqueEmail("hm-user");
  const hmEmail = uniqueEmail("hm-member");
  const title = `HM role ${randomUUID().slice(0, 8)}`;
  const resume = path.join(tmpdir(), `resume-${randomUUID()}.pdf`);
  await writeFile(resume, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF");

  try {
    // Organisation: approved, a published listing with a one-stage (Interview) pipeline.
    await createPendingOrganisation(page, organisationEmail, `HM Co ${randomUUID().slice(0, 8)}`);
    await setOrganisationStatus(organisationEmail, "approved");
    await page.goto("/organisation/opportunities/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Interview candidates for our HM flow.");
    await page.getByLabel("Amount (₹)").fill("12000");
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
    const step1 = page.getByRole("listitem").filter({ hasText: "Step 1" });
    await step1.getByLabel("Name").fill("Interview");
    await page.getByRole("button", { name: "Save pipeline" }).click();
    await expect(toast(page, "Pipeline saved.")).toBeVisible();

    // Invite a hiring manager and have them accept.
    const hmName = `E2E HM ${randomUUID().slice(0, 6)}`;
    const hmPage = await inviteAndAcceptHiringManager(browser, page, hmName, hmEmail);

    // A user applies.
    const user = await (await browser.newContext()).newPage();
    await signUpVerified(user, "user", userEmail);
    await user.goto("/user/profile");
    await user.getByLabel("Institution").fill("IIT Madras");
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

    // Organisation: advance the candidate to Interview and schedule with the HM as interviewer.
    await page.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    const card = page.getByRole("article", { name: "E2E user" });
    await openPipelinePanel(card);
    await card.getByRole("button", { name: "Advance to Interview" }).click();
    await expect(toast(page, "Candidate advanced to the next stage.")).toBeVisible();

    await openPipelinePanel(card);
    const scheduleForm = card.getByRole("form", { name: "Schedule an interview or test" });
    await scheduleForm.getByLabel("Start").fill(tomorrowIstLocal());
    await scheduleForm
      .getByLabel("Interviewers")
      .selectOption({ label: `${hmName} (Hiring manager)` });
    await scheduleForm.getByRole("button", { name: "Schedule" }).click();
    await expect(toast(page, "Interview scheduled.")).toBeVisible();

    // Hiring manager: sees the interview on the dashboard and the interviews list.
    const eventLinkName = `E2E user · ${title}`;
    await hmPage.goto("/hiring-manager");
    await expect(hmPage.getByRole("link", { name: eventLinkName })).toBeVisible();

    await hmPage.goto("/hiring-manager/interviews");
    const eventLink = hmPage.getByRole("link", { name: eventLinkName });
    await expect(eventLink).toBeVisible();
    await eventLink.click();
    await expect(hmPage).toHaveURL(/\/hiring-manager\/interviews\/[^/]+$/);
    const interviewUrl = hmPage.url();

    await expect(hmPage.getByRole("heading", { name: "E2E user" })).toBeVisible();
    await expect(hmPage.locator("body")).not.toContainText(userEmail);
    await expect(
      hmPage.getByText(/You can submit feedback once the interview starts/),
    ).toBeVisible();

    // Responsive: team page, HM dashboard and HM interview detail at 320px.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/organisation/team");
    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await hmPage.setViewportSize({ width: 320, height: 800 });
    await hmPage.goto("/hiring-manager");
    await expectNoHorizontalScroll(hmPage);
    await hmPage.goto(interviewUrl);
    await expectNoHorizontalScroll(hmPage);
    await hmPage.setViewportSize({ width: 1280, height: 800 });

    // An HM from a different organisation can't open this interview (404).
    const org2Email = uniqueEmail("hm-organisation-2");
    const org2Page = await (await browser.newContext()).newPage();
    await createPendingOrganisation(org2Page, org2Email, `Other Co ${randomUUID().slice(0, 8)}`);
    await setOrganisationStatus(org2Email, "approved");
    const hm2Page = await inviteAndAcceptHiringManager(
      browser,
      org2Page,
      `E2E HM2 ${randomUUID().slice(0, 6)}`,
      uniqueEmail("hm2-member"),
    );
    const response = await hm2Page.goto(interviewUrl);
    expect(response?.status()).toBe(404);

    // Organisation deactivates the hiring manager; they're redirected to the inactive page.
    await page.goto("/organisation/team");
    const memberRow = page.getByRole("row", { name: new RegExp(hmName) });
    if (await memberRow.count()) {
      await memberRow.getByRole("button", { name: "Deactivate" }).click();
    } else {
      await page
        .getByRole("listitem")
        .filter({ hasText: hmName })
        .getByRole("button", { name: "Deactivate" })
        .click();
    }
    await expect(toast(page, "Removed from the team.")).toBeVisible();

    await hmPage.goto("/hiring-manager");
    await expect(hmPage).toHaveURL(/\/hiring-manager\/inactive$/, { timeout: 15_000 });
    await expect(hmPage.getByRole("heading", { name: "Your access was removed" })).toBeVisible();
  } finally {
    await rm(resume, { force: true });
  }
});
