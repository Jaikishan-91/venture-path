import { expect, test } from "@playwright/test";
import { setOrganisationStatus, signUpVerified, uniqueEmail, toast } from "./helpers";

test("user creates and edits a profile", async ({ page }) => {
  await signUpVerified(page, "user", uniqueEmail("user-profile"));
  await expect(page.getByText("Complete your profile")).toBeVisible();

  await page.getByRole("link", { name: "Create profile" }).click();
  await expect(page).toHaveURL(/\/user\/profile$/);
  await page.getByLabel("Institution").fill("IIT Delhi");
  await page.getByLabel("Course").fill("B.Tech CSE");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByRole("textbox", { name: "Skill", exact: true }).fill("React");
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByRole("textbox", { name: "Skill 2" }).fill("TypeScript");
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByRole("textbox", { name: "Skill 3" }).fill("react");
  await page.getByRole("textbox", { name: "Link", exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(toast(page, "full web addresses")).toBeVisible();
  await expect(page.getByLabel("Institution")).toHaveValue("IIT Delhi");

  await page.getByRole("textbox", { name: "Link", exact: true }).fill("https://github.com/someone");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/user$/);
  // Success toast survives the redirect (flash cookie).
  await expect(toast(page, "Profile saved.")).toBeVisible();
  await expect(page.getByText("B.Tech CSE, IIT Delhi · Class of 2027")).toBeVisible();
  const skills = page.getByRole("list", { name: "Skills" });
  await expect(skills.getByRole("listitem")).toHaveText(["react", "typescript"]);
  await expect(page.getByRole("link", { name: "https://github.com/someone" })).toBeVisible();

  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/user\/profile$/);
  await expect(page.getByRole("textbox", { name: "Skill", exact: true })).toHaveValue("react");
  await expect(page.getByRole("textbox", { name: "Skill 2" })).toHaveValue("typescript");
  await page.getByLabel("Course").fill("M.Tech CSE");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("M.Tech CSE, IIT Delhi · Class of 2027")).toBeVisible();
});

test("Organisation submits a profile for review; editing after approval needs review again", async ({
  page,
}) => {
  const email = uniqueEmail("organisation-profile");
  await signUpVerified(page, "organisation", email);
  await expect(page.getByText("Create your business profile")).toBeVisible();

  await page.getByRole("link", { name: "Create profile" }).click();
  await page.getByLabel("Business name").fill("Acme Tools");
  await page.getByLabel("Description").fill("We make tools.");
  await page.getByLabel("Industry").fill("Manufacturing");
  await page.getByLabel("Location").fill("Pune, Maharashtra");
  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page).toHaveURL(/\/organisation$/);
  await expect(page.getByText("Acme Tools", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Awaiting review");

  await setOrganisationStatus(email, "approved");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Approved");

  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page.getByText("sends your profile back for admin review")).toBeVisible();
  await page.getByLabel("Location").fill("Mumbai, Maharashtra");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/organisation$/);
  await expect(page.getByRole("status")).toContainText("Awaiting review");
});

test("a rejected organisation resubmits by saving its profile", async ({ page }) => {
  const email = uniqueEmail("organisation-rejected");
  await signUpVerified(page, "organisation", email);
  await page.goto("/organisation/profile");
  await page.getByLabel("Business name").fill("Beta Foods");
  await page.getByLabel("Description").fill("Snacks.");
  await page.getByLabel("Industry").fill("Food");
  await page.getByLabel("Location").fill("Indore");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/organisation$/);

  await setOrganisationStatus(email, "rejected");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Not approved");

  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Awaiting review");
});

test("profile pages are limited to their role", async ({ page }) => {
  await signUpVerified(page, "user", uniqueEmail("user-cross"));
  await page.goto("/organisation/profile");
  await expect(page).toHaveURL(/\/user$/);
});

test("signed-out users can't open profile pages", async ({ page }) => {
  for (const path of ["/user/profile", "/organisation/profile"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});
