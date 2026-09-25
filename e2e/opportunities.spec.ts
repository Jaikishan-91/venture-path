import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createPendingMsme, setMsmeStatus, signUpVerified, uniqueEmail } from "./helpers";

async function createApprovedMsme(page: Page, prefix: string) {
  const email = uniqueEmail(prefix);
  await createPendingMsme(page, email, `Listings Co ${randomUUID().slice(0, 8)}`);
  await setMsmeStatus(email, "approved");
  return email;
}

async function fillListing(page: Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Help us run our social media.");
  await page.getByRole("textbox", { name: "Skill", exact: true }).fill("Canva");
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByRole("textbox", { name: "Skill 2" }).fill("Instagram");
  await page.getByLabel("Work mode").selectOption("hybrid");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("Amount (₹)").fill("15000");
}

test("approved MSME creates, publishes, edits, closes and reopens a listing", async ({ page }) => {
  await createApprovedMsme(page, "msme-listing");
  await page.goto("/msme");
  await page.getByRole("link", { name: "Your listings" }).click();
  await page.getByRole("link", { name: "New listing" }).click();

  await fillListing(page, "Marketing intern");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/msme\/opportunities$/);

  const card = page.getByRole("article", { name: "Marketing intern" });
  await expect(card).toContainText("Internship · Draft · ₹15,000 / month · Hybrid, Pune");

  await card.getByRole("button", { name: "Publish" }).click();
  await expect(card).toContainText("Published");

  await card.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel("Title").fill("Growth intern");
  await page.getByRole("button", { name: "Save changes" }).click();

  const edited = page.getByRole("article", { name: "Growth intern" });
  await expect(edited).toContainText("Published");
  await edited.getByRole("button", { name: "Close" }).click();
  await expect(edited).toContainText("Closed");
  await edited.getByRole("button", { name: "Reopen" }).click();
  await expect(edited).toContainText("Published");
});

test("drafts can be deleted; unpaid freelance work is refused", async ({ page }) => {
  await createApprovedMsme(page, "msme-draft");
  await page.goto("/msme/opportunities/new");

  await fillListing(page, "Logo design");
  await page.getByLabel("Freelance work").check();
  await page.getByLabel("Unpaid (internships only)").check();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Freelance work must be paid" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Logo design");

  await page.getByLabel("Paid", { exact: true }).check();
  await page.getByLabel("Amount (₹)").fill("5000");
  await page.getByLabel("Pay period").selectOption("fixed");
  await page.getByRole("button", { name: "Save as draft" }).click();

  const card = page.getByRole("article", { name: "Logo design" });
  await expect(card).toContainText("Freelance · Draft · ₹5,000 fixed");
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Delete draft" }).click();
  await expect(card).toBeHidden();
});

test("a pending MSME can't create listings", async ({ page }) => {
  await createPendingMsme(page, uniqueEmail("msme-pending-listing"), "Pending Co");
  await page.goto("/msme/opportunities");
  await expect(page.getByRole("status")).toContainText("needs admin approval");
  await expect(page.getByRole("link", { name: "New listing" })).toHaveCount(0);

  await page.goto("/msme/opportunities/new");
  await expect(page.getByText("Approval needed")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);
});

test("students can't open MSME listing pages", async ({ page }) => {
  await signUpVerified(page, "student", uniqueEmail("student-listings"));
  await page.goto("/msme/opportunities/new");
  await expect(page).toHaveURL(/\/student$/);
});
