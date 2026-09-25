import { expect, test } from "@playwright/test";
import { adminCredentials, signInAdmin } from "./helpers";

const { email: adminEmail, password: adminPassword } = adminCredentials();

test.describe("admin dashboard", () => {
  test.skip(
    !adminEmail || !adminPassword,
    "ADMIN_EMAIL/ADMIN_PASSWORD not set; run npm run db:seed",
  );

  test("shows the stat tiles and links to the review queue", async ({ page }) => {
    await signInAdmin(page);
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

    const summary = page.getByRole("group", { name: "Summary" });
    for (const label of ["Users", "Organisations", "Listings", "Applications"]) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Review organisations" }).click();
    await expect(page).toHaveURL(/\/admin\/organisations$/);
  });

  test("fits a 375px viewport with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await signInAdmin(page);
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);
  });
});
