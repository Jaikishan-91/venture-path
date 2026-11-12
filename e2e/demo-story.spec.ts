import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  adminCredentials,
  createPendingOrganisation,
  getEmailText,
  PASSWORD,
  signInAdmin,
  signUpVerified,
  toast,
  uniqueEmail,
} from "./helpers";

/**
 * docs/PRODUCT.md §8 demo story, end to end against the real LLM: challenge → winner → verified
 * proof → job with an AI interview stage → chat interview → report → accept. Serial; each test
 * builds on the one before. Own data only (random suffixes), removed by the global teardown.
 */

const SCREENSHOTS = "e2e/screenshots";
const PHONE = { width: 375, height: 800 };
const suffix = randomUUID().slice(0, 6);
const businessName = `Sharma Sweets ${suffix}`;
const challengeTitle = `Our Instagram gets no customers ${suffix}`;
const jobTitle = `Social Media Intern ${suffix}`;
const orgEmail = uniqueEmail("demo-owner");
const priyaEmail = uniqueEmail("demo-priya");
const rahulEmail = uniqueEmail("demo-rahul");
const PRIYA = `Priya ${suffix}`;
const RAHUL = `Rahul ${suffix}`;

let org: Page;
let priya: Page;
let rahul: Page;
const contexts: BrowserContext[] = [];
let challengeId = "";
let opportunityId = "";
let interviewUrl = "";
let aiOff = false;

/** `YYYY-MM-DD` for `days` from today in India, for a `date` input. */
function istDate(days: number): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function expectNoHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
}

/** Students never see AI scores (docs/PRODUCT.md §3 rule 2). */
async function expectNoScore(page: Page) {
  await expect(page.locator("body")).not.toContainText(/score/i);
}

async function newPage(browser: Browser, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  contexts.push(context);
  const page = await context.newPage();
  // Confirm dialogs (stop submissions, close challenge) are accepted.
  page.on("dialog", (dialog) => void dialog.accept());
  return page;
}

async function createStudent(page: Page, email: string, name: string) {
  await signUpVerified(page, "user", email, name);
  await page.goto("/user/profile");
  await page.getByLabel("Institution").fill("Pune University");
  await page.getByLabel("Course").fill("BBA");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(toast(page, /saved/i)).toBeVisible();
}

/** Reloads `page` until `done()` is true, or `timeoutMs` passes. */
async function pollReload(page: Page, done: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await page.waitForTimeout(3_000);
    await page.reload();
  }
  return done();
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, fullPage: true });

test.describe.configure({ mode: "serial" });

test.describe("demo story (docs/PRODUCT.md §8)", () => {
  const { email: adminEmail, password: adminPassword } = adminCredentials();
  test.skip(!adminEmail || !adminPassword, "ADMIN_EMAIL/ADMIN_PASSWORD not set");

  test.beforeAll(async ({ browser }) => {
    await mkdir(SCREENSHOTS, { recursive: true });
    org = await newPage(browser);
    priya = await newPage(browser);
    rahul = await newPage(browser);
  });

  test.afterAll(async () => {
    for (const context of contexts) await context.close();
  });

  test("1. admin approves a new organisation", async ({ browser }) => {
    test.setTimeout(90_000);
    await createPendingOrganisation(org, orgEmail, businessName);
    const admin = await newPage(browser);
    await signInAdmin(admin);
    await admin.goto("/admin/organisations");
    const card = admin.getByRole("article", { name: businessName });
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(card).toBeHidden();
    await org.reload();
    await expect(org.getByRole("status")).toContainText("Approved");
  });

  test("2. organisation posts a ₹ + hiring challenge with AI help and publishes", async () => {
    test.setTimeout(120_000);
    await org.goto("/organisation/challenges/new");
    await org.getByLabel("Title").fill(challengeTitle);
    await org
      .getByLabel("What's the problem?")
      .fill(
        "We are a sweet shop in Pune. We post on Instagram every week but nobody comes to the shop because of it. We want more walk-in customers from Instagram.",
      );
    const assist = org.getByRole("button", { name: "Make it clearer with AI" });
    // With the LLM switched off the button isn't shown and the story still runs (§3 rule 7).
    aiOff = (await assist.count()) === 0;
    if (aiOff) console.log("[demo] LLM disabled: running the AI-off path");
    if (!aiOff) {
      await assist.click();
      // Real LLM: either suggestions are filled in, or a graceful "AI unavailable / couldn't help".
      await expect(
        toast(org, /AI suggestions added|AI is unavailable|AI couldn't help/),
      ).toBeVisible({ timeout: 60_000 });
      await expect(assist).toBeEnabled();
    }
    const criteria = org.getByLabel("Judging point 1");
    if (!(await criteria.inputValue())) await criteria.fill("More walk-in customers");
    await org.getByLabel("Money (₹)").fill("2000");
    await org.getByLabel(/Hiring: offer the winner/).check();
    await org.getByLabel("Deadline").fill(istDate(7));
    await org.getByRole("button", { name: "Publish" }).click();
    await expect(org).toHaveURL(/\/organisation\/challenges$/, { timeout: 30_000 });
    const article = org.getByRole("article", { name: challengeTitle });
    await expect(article).toContainText("₹2,000");
    await article.getByRole("link", { name: "Submissions" }).click();
    await org.waitForURL(/\/submissions$/);
    challengeId = /challenges\/([^/]+)\/submissions/.exec(org.url())?.[1] ?? "";
    expect(challengeId).not.toBe("");
  });

  test("3. two students sign up and submit; one edits before the deadline", async () => {
    test.setTimeout(120_000);
    await createStudent(priya, priyaEmail, PRIYA);
    await createStudent(rahul, rahulEmail, RAHUL);

    await priya.goto("/challenges");
    await priya.getByRole("link", { name: new RegExp(challengeTitle) }).click();
    await expect(priya).toHaveURL(new RegExp(`/challenges/${challengeId}$`));
    await priya
      .getByLabel("Your solution")
      .fill(
        "Post 3 reels a week showing sweets being made, with the shop address and a 10% 'show this reel' discount. Tag Pune food pages and run a Diwali giveaway for followers who visit.",
      );
    await priya.getByLabel("Link (optional)").fill("https://example.com/priya-plan");
    await priya.getByRole("button", { name: "Submit solution" }).click();
    await expect(priya.getByRole("button", { name: "Update solution" })).toBeVisible({
      timeout: 20_000,
    });

    await rahul.goto(`/challenges/${challengeId}`);
    await rahul.getByLabel("Your solution").fill("Post more photos.");
    await rahul.getByLabel("Link (optional)").fill("https://example.com/rahul");
    await rahul.getByRole("button", { name: "Submit solution" }).click();
    await expect(rahul.getByRole("button", { name: "Update solution" })).toBeVisible({
      timeout: 20_000,
    });

    // Rahul edits his solution before the deadline.
    const edited = "Post more photos of the sweets, every day, with prices and the shop timings.";
    await rahul.getByLabel("Your solution").fill(edited);
    await rahul.getByRole("button", { name: "Update solution" }).click();
    await expect(toast(rahul, "Solution updated.")).toBeVisible({ timeout: 20_000 });
    await rahul.reload();
    await expect(rahul.getByLabel("Your solution")).toHaveValue(edited);
    await expectNoScore(rahul);
  });

  test("4. organisation stops submissions, sees AI-ranked solutions, picks and pays the winner, closes", async () => {
    test.setTimeout(240_000);
    await org.goto(`/organisation/challenges/${challengeId}/submissions`);
    await org.getByRole("button", { name: "Stop submissions now" }).click();
    await expect(org.getByRole("button", { name: "Close challenge" })).toBeVisible({
      timeout: 20_000,
    });

    // AI scoring runs in the background after each submission (real LLM, ~3–11 s per call).
    const started = Date.now();
    const list = org.getByRole("region", { name: "Submissions" });
    const scored = await pollReload(
      org,
      async () => (await list.getByText("AI scoring…").count()) === 0,
      150_000,
    );
    expect(scored, "AI scoring still pending").toBe(true);
    console.log(`[demo] challenge AI scoring settled after ${Date.now() - started} ms`);
    const scores = await list.getByText(/AI score \d+\/10/).allTextContents();
    console.log(`[demo] scores in list order: ${scores.join(", ") || "(none: AI failed)"}`);
    const values = scores.map((s) => Number(/(\d+)\/10/.exec(s)?.[1]));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    if (scores.length > 0) await expect(list.locator("a").first()).toContainText(/AI score/);
    await shot(org, "challenge-submissions");

    await list.getByRole("link", { name: new RegExp(PRIYA) }).click();
    await org.getByRole("button", { name: "Pick as winner" }).click();
    await expect(toast(org, "Picked as winner")).toBeVisible({ timeout: 20_000 });
    await org.getByRole("button", { name: "Marked as paid" }).click();
    await expect(org.getByText("Paid", { exact: true })).toBeVisible({ timeout: 20_000 });
    await org.getByLabel(/Offer hire: your message/).fill("We'd like you to join us as an intern.");
    await org.getByRole("button", { name: "Offer hire" }).click();
    await expect(org.getByText("Hire offer sent", { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await org.goto(`/organisation/challenges/${challengeId}/submissions`);
    await org.getByRole("button", { name: "Close challenge" }).click();
    await expect(org.getByText("This challenge is closed.")).toBeVisible({ timeout: 20_000 });

    await priya.goto(`/challenges/${challengeId}`);
    await expect(priya.getByText("Result: Winner")).toBeVisible();
    await expectNoScore(priya);
    await rahul.goto(`/challenges/${challengeId}`);
    await expect(rahul.getByText("Result: Not selected")).toBeVisible();
    await expectNoScore(rahul);
    await rahul.goto("/challenges");
    await expect(rahul.getByRole("region", { name: "Your submissions" })).toContainText(
      "Not selected",
    );
    await expectNoScore(rahul);

    expect(await getEmailText(priyaEmail, "You won")).toContain(challengeTitle);
    expect(await getEmailText(priyaEmail, "Hiring offer")).toContain("join us as an intern");
    expect(await getEmailText(rahulEmail, "Challenge result")).toContain(challengeTitle);

    await priya.goto("/user/proof");
    const proofs = priya.getByRole("list", { name: "Your proof cards" });
    await expect(
      proofs.getByRole("listitem").filter({ hasText: "Verified by business" }),
    ).toHaveCount(1);
    await expectNoScore(priya);
    await shot(priya, "priya-proof-verified");
  });

  test("5. a student adds a manual proof card", async () => {
    test.setTimeout(90_000);
    await rahul.goto("/user/proof");
    await rahul.getByLabel("What did you make?").fill("Menu cards for my aunt's café");
    await rahul.getByLabel("Link").fill("https://example.com/");
    await rahul
      .getByLabel("What I did")
      .fill("I designed printed menu cards and 10 Instagram posts in Canva for a small café.");
    await rahul.getByLabel("Skills").fill("canva, content writing");
    await rahul.getByRole("button", { name: "Add proof" }).click();
    const card = rahul
      .getByRole("list", { name: "Your proof cards" })
      .getByRole("listitem")
      .filter({ hasText: "Menu cards for my aunt's café" });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(/Added|Checked/);
    await expectNoScore(rahul);
  });

  test("6. organisation creates an internship with an AI interview stage and publishes", async () => {
    test.setTimeout(150_000);
    await org.goto("/organisation/opportunities/new");
    await org.getByLabel("Title").fill(jobTitle);
    await org
      .getByLabel("Description")
      .fill(
        "Run our sweet shop's Instagram: plan posts and reels, write captions in English and Hindi, and bring walk-in customers.",
      );
    await org.getByLabel("Amount (₹)").fill("8000");
    // The AI assist may add skills/questions on save (real LLM); then it lands on the edit page.
    await org.getByRole("button", { name: "Save as draft" }).click();
    await org.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 60_000 });
    await org.goto("/organisation/opportunities");
    const article = org.getByRole("article", { name: jobTitle });
    await article.getByRole("button", { name: "Publish" }).click();
    await expect(article).toContainText("Published");
    await article.getByRole("link", { name: "Edit" }).click();
    await expect(org).toHaveURL(/\/edit$/);
    opportunityId = /opportunities\/([^/]+)\/edit/.exec(org.url())?.[1] ?? "";
    expect(opportunityId).not.toBe("");

    await org.getByRole("button", { name: "Add stage" }).click();
    await org.getByRole("button", { name: "Add stage" }).click();
    const step1 = org.getByRole("listitem").filter({ hasText: "Step 1" });
    await step1.getByLabel("Name").fill("AI interview");
    await step1.getByLabel("Kind").selectOption("ai_interview");
    const step2 = org.getByRole("listitem").filter({ hasText: "Step 2" });
    await step2.getByLabel("Name").fill("Live interview");
    await step2.getByLabel("Kind").selectOption("interview");
    await org.getByRole("button", { name: "Save pipeline" }).click();
    await expect(toast(org, "Pipeline saved.")).toBeVisible({ timeout: 20_000 });
    await org.reload();
    await expect(
      org.getByRole("listitem").filter({ hasText: "Step 1" }).getByLabel("Kind"),
    ).toHaveValue("ai_interview");
  });

  test("7. both students apply with proof cards and no resume", async () => {
    test.setTimeout(90_000);
    for (const student of [priya, rahul]) {
      await student.goto(`/opportunities/${opportunityId}`);
      const proofBoxes = student.locator('input[name="proofIds"]');
      expect(await proofBoxes.count()).toBeGreaterThan(0);
      await expect(proofBoxes.first()).toBeChecked();
      await expect(student.getByLabel("No resume, my proof is enough")).toBeChecked();
      const answers = student.locator('textarea[name^="answer:"]');
      for (let i = 0; i < (await answers.count()); i++) {
        await answers
          .nth(i)
          .fill("I ran Instagram for a local shop and grew it to 2,000 followers.");
      }
      await student.getByRole("button", { name: "Apply" }).click();
      await expect(
        student.getByText(/Application sent|waiting for a decision/).first(),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expectNoScore(student);
    }
    await org.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    const priyaCard = org.getByRole("article", { name: PRIYA });
    await expect(priyaCard.getByRole("region", { name: "Proof" })).toContainText(
      "Verified by business",
    );
    await expect(
      org.getByRole("article", { name: RAHUL }).getByRole("region", { name: "Proof" }),
    ).toContainText("Menu cards");
  });

  test("8. organisation sends the AI interview; Priya takes it by chat on her phone", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    await org.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    for (const name of [PRIYA, RAHUL]) {
      await org.getByRole("article", { name }).getByLabel("Select for AI interview").check();
    }
    await org.getByRole("button", { name: "Send AI interview" }).click();
    await expect(toast(org, "AI interview sent to 2 candidates.")).toBeVisible({ timeout: 30_000 });

    // The question plan is generated in the background before the email goes out.
    const started = Date.now();
    const email = await getEmailText(priyaEmail, `Your AI interview for ${jobTitle}`, 120_000);
    console.log(`[demo] AI interview invite email after ${Date.now() - started} ms`);
    interviewUrl = /https?:\/\/\S+\/interview\/[A-Za-z0-9_-]+/.exec(email)?.[0] ?? "";
    expect(interviewUrl).not.toBe("");
    await getEmailText(rahulEmail, `Your AI interview for ${jobTitle}`, 120_000);

    // A fresh phone browser: the link asks her to sign in first, then returns to the interview.
    const phone = await newPage(browser, PHONE);
    await phone.goto(interviewUrl);
    await expect(phone).toHaveURL(/\/sign-in\?next=/);
    await phone.getByLabel("Email").fill(priyaEmail);
    await phone.getByLabel("Password").fill(PASSWORD);
    await phone.getByRole("button", { name: "Sign in" }).click();
    await expect(phone).toHaveURL(/\/interview\//, { timeout: 20_000 });
    await expect(phone.getByText(/An AI will ask you 6 questions/)).toBeVisible();
    const token = new URL(interviewUrl).pathname;
    await expectNoHorizontalScroll(phone, token);

    const start = phone.getByRole("button", { name: "I agree, start" });
    await expect(start).toBeDisabled();
    await phone.getByLabel(/I agree that an AI asks me questions/).check();
    await start.click();
    await expect(phone.getByText(/Question 1 of 6/)).toBeVisible({ timeout: 30_000 });
    await shot(phone, "interview-chat-phone");

    const answers = [
      "I made 30 Instagram posts and 8 reels for my uncle's sweet shop in Canva. I wrote captions in Hindi and English, and his followers went from 300 to 1,400 in two months.",
      "I plan a weekly calendar: Monday product photo, Wednesday a reel of sweets being made, Friday an offer. I check Instagram insights every Sunday and repeat what got the most saves.",
      "For the challenge I suggested reels with the shop address and a 10% discount for anyone who shows the reel. That brings people into the shop and we can count them.",
      "I would reply politely within an hour, apologise, offer a fresh box or a refund, and then post about how we keep sweets fresh, so other customers see we care.",
      "I love food and small businesses, and I want to learn marketing on the job. I can work 20 hours a week, evenings and weekends, from Pune.",
      "I measure results by walk-ins: a discount code per post, and I ask customers at the counter how they found us. Last time 40 people used the code in a month.",
    ];
    const answerBox = phone.getByLabel("Your answer");
    const done = phone.getByText("Submitted ✓");
    for (let turn = 0; turn < 14 && !(await done.isVisible()); turn++) {
      await expect(answerBox.or(done)).toBeVisible({ timeout: 90_000 });
      if (await done.isVisible()) break;
      await expect(answerBox).toBeEnabled({ timeout: 90_000 });
      if (turn === 0) {
        // One pasted answer, so the report shows a flag (counted, never a reason to reject).
        await answerBox.dispatchEvent("paste");
      }
      await answerBox.fill(answers[Math.min(turn, answers.length - 1)]);
      const turnStart = Date.now();
      await phone.getByRole("button", { name: "Send answer" }).click();
      await expect(phone.getByRole("button", { name: "Send answer" }).or(done)).toBeVisible({
        timeout: 90_000,
      });
      await expect(phone.getByText("thinking…")).toBeHidden({ timeout: 90_000 });
      const header =
        (await phone.locator("[data-slot=card-description]").first().textContent()) ?? "";
      console.log(`[demo] answer ${turn + 1} took ${Date.now() - turnStart} ms → ${header.trim()}`);
    }
    await expect(done).toBeVisible({ timeout: 90_000 });
    await expectNoScore(phone);
    await shot(phone, "interview-submitted-phone");
  });

  test("9. organisation reads the AI interview report, moves Priya to the live interview and accepts her", async () => {
    test.setTimeout(300_000);
    await org.goto(`/organisation/opportunities/${opportunityId}/applicants`);
    const card = org.getByRole("article", { name: PRIYA });
    const report = card.getByRole("region", { name: "AI interview report" });

    const started = Date.now();
    const writing = () => report.getByText("Writing the report").count();
    let settled = await pollReload(org, async () => (await writing()) === 0, 150_000);
    expect(settled, "report still being written").toBe(true);
    if (aiOff) {
      // No LLM: the report can't be written; the owner reads the full chat and still decides.
      await expect(report.getByRole("button", { name: "Retry report" })).toBeVisible();
      await expect(report.getByText("View full chat")).toBeVisible();
      await expect(report).toContainText("Pasted 1 answer");
    } else if (await report.getByRole("button", { name: "Retry report" }).isVisible()) {
      console.log("[demo] report failed once; retrying");
      await report.getByRole("button", { name: "Retry report" }).click();
      await expect(toast(org, "Writing the report again")).toBeVisible({ timeout: 20_000 });
      settled = await pollReload(
        org,
        async () =>
          (await writing()) === 0 &&
          !(await report.getByRole("button", { name: "Retry report" }).isVisible()),
        150_000,
      );
      expect(settled, "report retry did not succeed").toBe(true);
    }
    if (!aiOff) {
      console.log(`[demo] AI interview report ready after ${Date.now() - started} ms`);
      await expect(report.getByText(/Strong fit|Maybe|Not a fit/)).toBeVisible();
      await expect(report.getByText("(advice only)")).toBeVisible();
      await expect(report.locator("tbody tr").first()).toContainText(/\d\/5/);
      expect(await report.locator("tbody q").count()).toBeGreaterThan(0);
      await expect(report).toContainText("🚩 Flags:");
      await expect(report).toContainText("Pasted 1 answer");
      await shot(org, "interview-report");
    }

    await report.getByRole("button", { name: "Move to Live interview" }).click();
    await expect(toast(org, "Candidate advanced to the next stage.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(card).toContainText("Live interview");

    const summary = card.getByText("Pipeline & scheduling");
    if (await summary.isVisible()) await summary.click();
    await card.getByRole("button", { name: "Pass final stage & accept" }).click();
    await expect(toast(org, "Candidate passed the final stage and was accepted.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(card).toContainText("Accepted");
    expect(await getEmailText(priyaEmail, `Application accepted: ${jobTitle}`)).toContain(
      businessName,
    );

    await priya.goto("/user/applications");
    await expect(priya.getByText(jobTitle).first()).toBeVisible();
    await expectNoScore(priya);
  });

  test("10. phone width (375px): no horizontal overflow on the new pages", async () => {
    test.setTimeout(120_000);
    for (const page of [org, priya]) await page.setViewportSize(PHONE);
    await expectNoHorizontalScroll(priya, "/challenges");
    await expectNoHorizontalScroll(priya, `/challenges/${challengeId}`);
    await expectNoHorizontalScroll(priya, "/user/proof");
    await expectNoHorizontalScroll(priya, interviewUrl.replace(/^https?:\/\/[^/]+/, ""));
    await expectNoHorizontalScroll(org, `/organisation/challenges/${challengeId}/submissions`);
    await expectNoHorizontalScroll(org, `/organisation/opportunities/${opportunityId}/applicants`);
    await shot(org, "applicants-phone");
  });
});
