import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  clearRole,
  getVerificationLink,
  signUp,
  signUpVerified,
  uniqueEmail,
  toast,
} from "./helpers";

test("signed-out users are sent to the sign-in page for that area", async ({ page }) => {
  await page.goto("/user");
  await expect(page).toHaveURL("/sign-in");
  await page.goto("/organisation/opportunities");
  await expect(page).toHaveURL("/organisation/sign-in");
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin/sign-in");
});

test("old student and MSME URLs redirect to the renamed pages", async ({ page }) => {
  await page.goto("/msme/profile");
  await expect(page).toHaveURL("/organisation/sign-in");
  await page.goto("/student/applications");
  await expect(page).toHaveURL("/sign-in");
});

test("each sign-in page accepts only its own account type", async ({ page, browser }) => {
  const email = uniqueEmail("org-signin");
  await signUpVerified(page, "organisation", email);
  const other = await (await browser.newContext()).newPage();

  for (const path of ["/sign-in", "/admin/sign-in"]) {
    await other.goto(path);
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Password").fill(PASSWORD);
    await other.getByRole("button", { name: "Sign in" }).click();
    await expect(toast(other, "This is an organisation account")).toBeVisible();
    await other.goto("/organisation");
    await expect(other).toHaveURL("/organisation/sign-in");
  }

  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill(PASSWORD);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other).toHaveURL(/\/organisation$/, { timeout: 15_000 });
});

test("the admin has a sign-in page but no sign-up", async ({ page }) => {
  await page.goto("/admin/sign-in");
  await expect(page.getByText("Admin sign in")).toBeVisible();
  await expect(page.getByRole("link", { name: /Create/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});

for (const role of ["user", "organisation"] as const) {
  test(`${role} signs up, verifies email and lands on their dashboard`, async ({ page }) => {
    const email = uniqueEmail(role);
    await signUp(page, role, email);

    await page.goto(await getVerificationLink(email));
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await expect(
      page.getByRole("heading", { name: `${role === "user" ? "User" : "Organisation"} dashboard` }),
    ).toBeVisible();

    for (const other of ["/user", "/organisation", "/admin"].filter((p) => p !== `/${role}`)) {
      await page.goto(other);
      await expect(page).toHaveURL(new RegExp(`/${role}$`));
    }

    await page.goto("/onboarding/role");
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
  });
}

test("a user without a role must choose one, once", async ({ page }) => {
  const email = uniqueEmail("norole");
  await signUp(page, "user", email);
  await clearRole(email);

  await page.goto(await getVerificationLink(email));
  await expect(page).toHaveURL(/\/onboarding\/role$/);

  await page.goto("/user");
  await expect(page).toHaveURL(/\/onboarding\/role$/);

  await page.getByRole("button", { name: "I'm an organisation (business)" }).click();
  await expect(page).toHaveURL(/\/organisation$/);

  await page.goto("/onboarding/role");
  await expect(page).toHaveURL(/\/organisation$/);
});

test("unverified users cannot sign in", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await signUp(page, "user", email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(toast(page, "isn't verified")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(toast(page, "Invalid email or password.")).toBeVisible();
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
  await expect(toast(page, "Couldn't sign in with Google")).toBeVisible();
});

test("seeded admin signs in to the admin dashboard", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL/ADMIN_PASSWORD not set; run npm run db:seed");

  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Sign-in then two server redirects; the dev server compiles each route on first hit.
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/admin");
  await expect(page).toHaveURL("/admin/sign-in");
});
