import { expect, test } from "@playwright/test";
import { setMsmeStatus, signUpVerified, uniqueEmail } from "./helpers";

test("student creates and edits a profile", async ({ page }) => {
  await signUpVerified(page, "student", uniqueEmail("student-profile"));
  await expect(page.getByText("Complete your profile")).toBeVisible();

  await page.getByRole("link", { name: "Create profile" }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);
  await page.getByLabel("Institution").fill("IIT Delhi");
  await page.getByLabel("Course").fill("B.Tech CSE");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByLabel("Skills").fill("React, TypeScript, react");
  await page.getByLabel("Links").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "full web addresses" })).toBeVisible();
  await expect(page.getByLabel("Institution")).toHaveValue("IIT Delhi");

  await page.getByLabel("Links").fill("https://github.com/someone");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText("B.Tech CSE, IIT Delhi · Class of 2027")).toBeVisible();
  const skills = page.getByRole("list", { name: "Skills" });
  await expect(skills.getByRole("listitem")).toHaveText(["react", "typescript"]);
  await expect(page.getByRole("link", { name: "https://github.com/someone" })).toBeVisible();

  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);
  await expect(page.getByRole("textbox", { name: "Skills" })).toHaveValue("react, typescript");
  await page.getByLabel("Course").fill("M.Tech CSE");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("M.Tech CSE, IIT Delhi · Class of 2027")).toBeVisible();
});

test("MSME submits a profile for review; editing after approval needs review again", async ({
  page,
}) => {
  const email = uniqueEmail("msme-profile");
  await signUpVerified(page, "msme", email);
  await expect(page.getByText("Create your business profile")).toBeVisible();

  await page.getByRole("link", { name: "Create profile" }).click();
  await page.getByLabel("Business name").fill("Acme Tools");
  await page.getByLabel("Description").fill("We make tools.");
  await page.getByLabel("Industry").fill("Manufacturing");
  await page.getByLabel("Location").fill("Pune, Maharashtra");
  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page).toHaveURL(/\/msme$/);
  await expect(page.getByText("Acme Tools", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Awaiting review");

  await setMsmeStatus(email, "approved");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Approved");

  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page.getByText("sends your profile back for admin review")).toBeVisible();
  await page.getByLabel("Location").fill("Mumbai, Maharashtra");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/msme$/);
  await expect(page.getByRole("status")).toContainText("Awaiting review");
});

test("a rejected MSME resubmits by saving its profile", async ({ page }) => {
  const email = uniqueEmail("msme-rejected");
  await signUpVerified(page, "msme", email);
  await page.goto("/msme/profile");
  await page.getByLabel("Business name").fill("Beta Foods");
  await page.getByLabel("Description").fill("Snacks.");
  await page.getByLabel("Industry").fill("Food");
  await page.getByLabel("Location").fill("Indore");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/msme$/);

  await setMsmeStatus(email, "rejected");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Not approved");

  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Awaiting review");
});

test("profile pages are limited to their role", async ({ page }) => {
  await signUpVerified(page, "student", uniqueEmail("student-cross"));
  await page.goto("/msme/profile");
  await expect(page).toHaveURL(/\/student$/);
});

test("signed-out users can't open profile pages", async ({ page }) => {
  for (const path of ["/student/profile", "/msme/profile"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});
