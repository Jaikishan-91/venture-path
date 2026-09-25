import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPendingOrganisation,
  getEmailText,
  setOrganisationStatus,
  signUpVerified,
  toast,
  uniqueEmail,
} from "./helpers";

test("user applies with a resume; organisation accepts and both see contact email", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const organisationEmail = uniqueEmail("apply-organisation");
  const userEmail = uniqueEmail("apply-user");
  const business = `Apply Co ${randomUUID().slice(0, 8)}`;
  const resume = path.join(tmpdir(), `resume-${randomUUID()}.pdf`);
  await writeFile(resume, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF");

  try {
    await createPendingOrganisation(page, organisationEmail, business);
    await setOrganisationStatus(organisationEmail, "approved");
    await page.goto("/organisation/opportunities/new");
    await page.getByLabel("Title").fill("Campus ambassador");
    await page.getByLabel("Description").fill("Represent us on campus.");
    await page.getByLabel("Amount (₹)").fill("8000");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page
      .getByRole("article", { name: "Campus ambassador" })
      .getByRole("button", { name: "Publish" })
      .click();

    const user = await (await browser.newContext()).newPage();
    await signUpVerified(user, "user", userEmail);
    await user.goto("/user/profile");
    await user.getByLabel("Institution").fill("IIT Delhi");
    await user.getByLabel("Course").fill("B.Tech");
    await user.getByLabel("Graduation year").fill("2027");
    await user.getByRole("button", { name: "Save profile" }).click();
    await user.goto("/opportunities?q=Campus+ambassador");
    await user.getByRole("link", { name: /Campus ambassador/ }).click();
    await user.getByLabel("Resume file").setInputFiles(resume);
    await user.getByLabel("Note (optional)").fill("I run the college club.");
    await user.getByRole("button", { name: "Apply" }).click();
    await expect(user.getByText("waiting for a decision")).toBeVisible();

    await page.getByRole("link", { name: "Applicants" }).click();
    const card = page.getByRole("article", { name: "E2E user" });
    await expect(card).toContainText("IIT Delhi");
    await expect(card).not.toContainText(userEmail);
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(toast(page, "Application accepted")).toBeVisible();
    await expect(card).toContainText(userEmail);

    await user.goto("/user/applications");
    await expect(user.getByText("Accepted")).toBeVisible();
    await expect(user.getByText(organisationEmail)).toBeVisible();
    expect(await getEmailText(organisationEmail, "New application")).toContain("Campus ambassador");
    expect(await getEmailText(userEmail, "Application accepted")).toContain(organisationEmail);
  } finally {
    await rm(resume, { force: true });
  }
});
