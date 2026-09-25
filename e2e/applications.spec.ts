import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createPendingMsme,
  getEmailText,
  setMsmeStatus,
  signUpVerified,
  uniqueEmail,
} from "./helpers";

test("student applies with a resume; MSME accepts and both see contact email", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const msmeEmail = uniqueEmail("apply-msme");
  const studentEmail = uniqueEmail("apply-student");
  const business = `Apply Co ${randomUUID().slice(0, 8)}`;
  const resume = path.join(tmpdir(), `resume-${randomUUID()}.pdf`);
  await writeFile(resume, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF");

  try {
    await createPendingMsme(page, msmeEmail, business);
    await setMsmeStatus(msmeEmail, "approved");
    await page.goto("/msme/opportunities/new");
    await page.getByLabel("Title").fill("Campus ambassador");
    await page.getByLabel("Description").fill("Represent us on campus.");
    await page.getByLabel("Amount (₹)").fill("8000");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page
      .getByRole("article", { name: "Campus ambassador" })
      .getByRole("button", { name: "Publish" })
      .click();

    const student = await (await browser.newContext()).newPage();
    await signUpVerified(student, "student", studentEmail);
    await student.goto("/student/profile");
    await student.getByLabel("Institution").fill("IIT Delhi");
    await student.getByLabel("Course").fill("B.Tech");
    await student.getByLabel("Graduation year").fill("2027");
    await student.getByRole("button", { name: "Save profile" }).click();
    await student.goto("/opportunities?q=Campus+ambassador");
    await student.getByRole("link", { name: /Campus ambassador/ }).click();
    await student.getByLabel("Resume").setInputFiles(resume);
    await student.getByLabel("Note (optional)").fill("I run the college club.");
    await student.getByRole("button", { name: "Apply" }).click();
    await expect(student.getByText("waiting for a decision")).toBeVisible();

    await page.getByRole("link", { name: "Applicants" }).click();
    const card = page.getByRole("article", { name: "E2E student" });
    await expect(card).toContainText("IIT Delhi");
    await expect(card).not.toContainText(studentEmail);
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card).toContainText(studentEmail);

    await student.goto("/student/applications");
    await expect(student.getByText("Accepted")).toBeVisible();
    await expect(student.getByText(msmeEmail)).toBeVisible();
    expect(await getEmailText(msmeEmail, "New application")).toContain("Campus ambassador");
    expect(await getEmailText(studentEmail, "Application accepted")).toContain(msmeEmail);
  } finally {
    await rm(resume, { force: true });
  }
});
