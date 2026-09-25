import { devices, expect, test } from "@playwright/test";
import { toast, uniqueEmail } from "./helpers";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "VenturePath" })).toBeVisible();
});

test("health endpoint reports the database is up", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", db: "ok" });
});

test.describe("phone width", () => {
  // iPhone 13 screen, touch and user agent, still in Chromium.
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["iPhone 13"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("pages fit the screen and toasts stay on screen", async ({ page }) => {
    for (const path of ["/", "/opportunities", "/sign-in", "/organisation/sign-up"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(uniqueEmail("phone"));
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const message = toast(page, "Invalid email or password.");
    await expect(message).toBeVisible();
    // Let the slide-in animation finish before measuring.
    await page.waitForTimeout(500);
    const box = await message.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
