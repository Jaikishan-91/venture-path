import { randomUUID } from "node:crypto";
import { devices, expect, test } from "@playwright/test";
import {
  createPendingOrganisation,
  setOrganisationStatus,
  signUpVerified,
  uniqueEmail,
} from "./helpers";

test("a fresh organisation sees the create-profile prompt, not dashboard stats", async ({
  page,
}) => {
  await signUpVerified(page, "organisation", uniqueEmail("dashboard-organisation-fresh"));
  await expect(page.getByRole("heading", { name: "Organisation dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create profile" })).toHaveAttribute(
    "href",
    "/organisation/profile",
  );
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a pending organisation sees the awaiting-review status and stats", async ({ page }) => {
  await createPendingOrganisation(
    page,
    uniqueEmail("dashboard-organisation-pending"),
    `Pending Dashboard Co ${randomUUID().slice(0, 8)}`,
  );

  await expect(page.getByRole("heading", { name: "Organisation dashboard" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Awaiting review");
  await expect(page.getByRole("status")).toHaveCount(1);
  const summary = page.getByRole("group", { name: "Summary" });
  await expect(summary.getByText("Published", { exact: true })).toBeVisible();
  await expect(summary.getByText("Drafts", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Your listings" })).toHaveAttribute(
    "href",
    "/organisation/opportunities",
  );
});

test("an approved organisation's dashboard shows stat tiles and no listings yet", async ({
  page,
}) => {
  const email = uniqueEmail("dashboard-organisation-approved");
  await createPendingOrganisation(page, email, `Approved Dashboard Co ${randomUUID().slice(0, 8)}`);
  await setOrganisationStatus(email, "approved");
  await page.reload();

  await expect(page.getByRole("status")).toContainText("Approved");
  const summary = page.getByRole("group", { name: "Summary" });
  await expect(summary.getByText("Active applicants")).toBeVisible();
  await expect(summary.getByText("Awaiting decision")).toBeVisible();
  await expect(summary.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("No analyses yet")).toBeVisible();
  await expect(page.getByText("No listings yet. Create your first listing.")).toBeVisible();

  await page.getByRole("link", { name: "Your listings" }).click();
  await expect(page).toHaveURL(/\/organisation\/opportunities$/);
});

test.describe("phone width", () => {
  // iPhone 13 screen, touch and user agent, still in Chromium.
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["iPhone 13"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("organisation dashboard fits a 375px screen with no horizontal scroll", async ({ page }) => {
    const email = uniqueEmail("dashboard-organisation-phone");
    await createPendingOrganisation(page, email, `Phone Dashboard Co ${randomUUID().slice(0, 8)}`);
    await setOrganisationStatus(email, "approved");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Approved");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
