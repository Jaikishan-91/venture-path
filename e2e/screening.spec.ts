import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPendingOrganisation,
  setOrganisationStatus,
  signUpVerified,
  toast,
  uniqueEmail,
} from "./helpers";

// Runs with the LLM disabled (as in every e2e spec): no AI skills, drafts or scores, so the
// organisation writes its own question and scores show "-".
test("resume library, screening questions, answers and applicant filters", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const organisationEmail = uniqueEmail("screen-organisation");
  const userEmail = uniqueEmail("screen-user");
  const title = `Screened role ${randomUUID().slice(0, 8)}`;
  const files = [1, 2].map((n) => path.join(tmpdir(), `cv-${n}-${randomUUID()}.pdf`));
  for (const file of files) {
    await writeFile(file, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF");
  }

  try {
    // Organisation: a listing with one screening question.
    await createPendingOrganisation(
      page,
      organisationEmail,
      `Screen Co ${randomUUID().slice(0, 8)}`,
    );
    await setOrganisationStatus(organisationEmail, "approved");
    await page.goto("/organisation/opportunities/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Design and build pages.");
    await page.getByLabel("Amount (₹)").fill("9000");
    await page.getByRole("button", { name: "Add question" }).click();
    await page
      .getByRole("textbox", { name: "Question 1" })
      .fill("Tell us about a website you built.");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(toast(page, "Draft saved")).toBeVisible();
    await page
      .getByRole("article", { name: title })
      .getByRole("button", { name: "Publish" })
      .click();
    await expect(toast(page, "Listing published")).toBeVisible();

    // User: profile, two resumes in the library, rename one, delete the other.
    const user = await (await browser.newContext()).newPage();
    await signUpVerified(user, "user", userEmail);
    await user.goto("/user/profile");
    await user.getByLabel("Institution").fill("IIT Delhi");
    await user.getByLabel("Course").fill("B.Tech");
    await user.getByLabel("Graduation year").fill("2027");
    await user.getByRole("button", { name: "Save profile" }).click();

    await user.goto("/user/resumes");
    for (const file of files) {
      await user.getByLabel("Add a resume").setInputFiles(file);
      await user.getByRole("button", { name: "Upload" }).click();
      await expect(toast(user, "Resume added")).toBeVisible();
    }
    await expect(user.getByRole("heading", { name: "Library (2/5)" })).toBeVisible();
    const resumes = user.getByRole("list", { name: "Resumes" });
    const first = resumes.getByRole("listitem", { name: path.basename(files[0]) });
    await first.getByRole("textbox").fill("Design CV.pdf");
    await first.getByRole("button", { name: "Rename" }).click();
    await expect(toast(user, "Resume renamed")).toBeVisible();
    await resumes
      .getByRole("listitem", { name: path.basename(files[1]) })
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(toast(user, "Resume deleted")).toBeVisible();
    await expect(user.getByRole("heading", { name: "Library (1/5)" })).toBeVisible();
    // Without an LLM, skills can't be extracted; the page says so instead of inventing any.
    await expect(user.getByText("Skill extraction is not available right now.")).toBeVisible();

    // Apply with the library resume and answer the question.
    await user.goto("/opportunities?q=" + encodeURIComponent(title));
    await user.getByRole("link", { name: new RegExp(title) }).click();
    await expect(user.getByRole("radio", { name: "Design CV.pdf" })).toBeChecked();
    await user
      .getByLabel("1. Tell us about a website you built.")
      .fill("A shop for my family's bakery in Next.js.");
    await user.getByRole("button", { name: "Apply" }).click();
    await expect(user.getByText("waiting for a decision")).toBeVisible();

    // Organisation: sees the answer and "-" scores, and filters by time.
    await page
      .getByRole("article", { name: title })
      .getByRole("link", { name: "Applicants" })
      .click();
    const card = page.getByRole("article", { name: "E2E user" });
    await card.getByText("Answers (1)").click();
    await expect(card).toContainText("A shop for my family's bakery in Next.js.");
    await expect(card.getByRole("definition").first()).toHaveText("-");
    await expect(card.getByRole("link", { name: "Download Design CV.pdf" })).toBeVisible();

    await page.getByLabel("Applied").selectOption("24h");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/applied=24h/);
    await expect(page.getByRole("article", { name: "E2E user" })).toBeVisible();

    await page.getByLabel("Minimum score").selectOption("50");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("article", { name: "E2E user" })).toHaveCount(0);
    await expect(page.getByText("1 not yet scored is hidden by the score filter.")).toBeVisible();

    // The question is locked now that someone applied.
    await page.goto("/organisation/opportunities");
    await page.getByRole("article", { name: title }).getByRole("link", { name: "Edit" }).click();
    await expect(page.getByText("Questions can't change after someone has applied.")).toBeVisible();
  } finally {
    await Promise.all(files.map((file) => rm(file, { force: true })));
  }
});
