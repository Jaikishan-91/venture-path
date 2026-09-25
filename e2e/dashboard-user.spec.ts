import { expect, test } from "@playwright/test";
import { signUpVerified, uniqueEmail } from "./helpers";

test("user dashboard shows the heading, stat tiles and explore-jobs link", async ({ page }) => {
  const email = uniqueEmail("dashboard-user");
  await signUpVerified(page, "user", email);

  await expect(page.getByRole("heading", { name: "User dashboard" })).toBeVisible();

  // Scope to the stat tiles group: plain text like "Accepted" also appears in status pills
  // elsewhere on the page, so an unscoped getByText would hit a strict-mode violation.
  const summary = page.getByRole("group", { name: "Summary" });
  await expect(summary.getByText("Applications", { exact: true })).toBeVisible();
  await expect(summary.getByText("Under review", { exact: true })).toBeVisible();
  await expect(summary.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(summary.getByText("Not selected", { exact: true })).toBeVisible();

  // The sidebar has an "Explore jobs" link too; use the dashboard's own.
  await page
    .getByRole("region", { name: "Find your next opportunity" })
    .getByRole("link", { name: "Explore jobs" })
    .click();
  await expect(page).toHaveURL(/\/opportunities$/);
});

test("no profile shows a Create profile link", async ({ page }) => {
  const email = uniqueEmail("dashboard-user-noprofile");
  await signUpVerified(page, "user", email);

  await expect(page.getByRole("link", { name: "Create profile" })).toBeVisible();
});

test("has no horizontal overflow on a phone-width viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const email = uniqueEmail("dashboard-user-mobile");
  await signUpVerified(page, "user", email);

  await expect(page.getByRole("heading", { name: "User dashboard" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);
});
