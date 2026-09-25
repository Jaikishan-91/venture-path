import { expect, test } from "@playwright/test";
import { PASSWORD, clearRole, getVerificationLink, signUp, uniqueEmail } from "./helpers";

test("signed-out users are sent to sign-in", async ({ page }) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/sign-in$/);
});

for (const role of ["student", "msme"] as const) {
  test(`${role} signs up, verifies email and lands on their dashboard`, async ({ page }) => {
    const email = uniqueEmail(role);
    await signUp(page, role, email);

    await page.goto(await getVerificationLink(email));
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await expect(
      page.getByRole("heading", { name: `${role === "student" ? "Student" : "MSME"} dashboard` }),
    ).toBeVisible();

    for (const other of ["/student", "/msme", "/admin"].filter((p) => p !== `/${role}`)) {
      await page.goto(other);
      await expect(page).toHaveURL(new RegExp(`/${role}$`));
    }

    await page.goto("/onboarding/role");
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
  });
}

test("a user without a role must choose one, once", async ({ page }) => {
  const email = uniqueEmail("norole");
  await signUp(page, "student", email);
  await clearRole(email);

  await page.goto(await getVerificationLink(email));
  await expect(page).toHaveURL(/\/onboarding\/role$/);

  await page.goto("/student");
  await expect(page).toHaveURL(/\/onboarding\/role$/);

  await page.getByRole("button", { name: "I'm an MSME (business)" }).click();
  await expect(page).toHaveURL(/\/msme$/);

  await page.goto("/onboarding/role");
  await expect(page).toHaveURL(/\/msme$/);
});

test("unverified users cannot sign in", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await signUp(page, "student", email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't verified" })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid email or password." }),
  ).toBeVisible();
});

test("Google sign-in redirects to Google with our callback", async ({ page }) => {
  test.skip(!process.env.GOOGLE_CLIENT_ID, "Google credentials not configured");

  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.goto("/sign-in");
  const request = page.waitForRequest((req) =>
    req.url().startsWith("https://accounts.google.com/"),
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();

  const url = new URL((await request).url());
  expect(url.searchParams.get("client_id")).toBe(process.env.GOOGLE_CLIENT_ID);
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/auth/callback/google",
  );
});

test("a failed Google sign-in explains what to do", async ({ page }) => {
  await page.goto("/sign-in?error=google");
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't sign in with Google" }),
  ).toBeVisible();
});

test("seeded admin signs in to the admin dashboard", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL/ADMIN_PASSWORD not set; run npm run db:seed");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Sign-in then two server redirects; the dev server compiles each route on first hit.
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in$/);
});
