import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  adminCredentials,
  createPendingOrganisation,
  getEmailText,
  signInAdmin,
  signUpVerified,
  uniqueEmail,
} from "./helpers";

const { email: adminEmail, password: adminPassword } = adminCredentials();

test.describe("admin review", () => {
  test.skip(
    !adminEmail || !adminPassword,
    "ADMIN_EMAIL/ADMIN_PASSWORD not set; run npm run db:seed",
  );

  test("admin approves a pending organisation; the organisation sees it and gets an email", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("organisation-approve");
    const businessName = `Approve Co ${randomUUID().slice(0, 8)}`;
    await createPendingOrganisation(page, email, businessName);

    const admin = await (await browser.newContext()).newPage();
    await signInAdmin(admin);
    await admin.getByRole("link", { name: "Review organisations" }).click();
    const card = admin.getByRole("article", { name: businessName });
    await expect(card).toContainText(email);
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(card).toBeHidden();

    await admin.getByRole("link", { name: /^Approved/ }).click();
    await expect(admin.getByRole("article", { name: businessName })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("status")).toContainText("Approved");
    expect(await getEmailText(email, "is approved")).toContain(businessName);
  });

  test("rejecting needs a reason; the organisation sees the reason and gets an email", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("organisation-reject");
    const businessName = `Reject Co ${randomUUID().slice(0, 8)}`;
    await createPendingOrganisation(page, email, businessName);

    const admin = await (await browser.newContext()).newPage();
    await signInAdmin(admin);
    await admin.goto("/admin/organisations");
    const card = admin.getByRole("article", { name: businessName });
    const reason = card.getByLabel("Reason for rejecting");

    await card.getByRole("button", { name: "Reject" }).click();
    expect(await reason.evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(
      true,
    );
    await expect(card).toBeVisible();

    await reason.fill("Please add your GST number to the description.");
    await card.getByRole("button", { name: "Reject" }).click();
    await expect(card).toBeHidden();

    await page.reload();
    await expect(page.getByRole("status")).toContainText("Not approved");
    await expect(page.getByRole("status")).toContainText("Please add your GST number");
    expect(await getEmailText(email, "wasn't approved")).toContain("Please add your GST number");

    await admin.goto("/admin/organisations?status=rejected");
    const rejectedCard = admin.getByRole("article", { name: businessName });
    await rejectedCard.getByRole("button", { name: "Approve" }).click();
    await expect(rejectedCard).toBeHidden();
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Approved");
  });
});

test("users and organisations can't open the admin review page", async ({ page, browser }) => {
  await signUpVerified(page, "user", uniqueEmail("user-admin"));
  await page.goto("/admin/organisations");
  await expect(page).toHaveURL(/\/user$/);

  const organisation = await (await browser.newContext()).newPage();
  await signUpVerified(organisation, "organisation", uniqueEmail("organisation-admin"));
  await organisation.goto("/admin/organisations");
  await expect(organisation).toHaveURL(/\/organisation$/);
});
