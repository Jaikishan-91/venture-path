import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createPendingMsme, setMsmeStatus, uniqueEmail } from "./helpers";

test("anyone can search and open a listing; hidden listings stay hidden", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("browse-msme");
  const business = `Browse Co ${randomUUID().slice(0, 8)}`;
  await createPendingMsme(page, email, business);
  await setMsmeStatus(email, "approved");

  await page.goto("/msme/opportunities/new");
  await page.getByLabel("Title").fill("Social media marketing intern");
  await page.getByLabel("Description").fill("Plan Instagram posts and report on engagement.");
  await page.getByRole("textbox", { name: "Skill", exact: true }).fill("canva");
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByRole("textbox", { name: "Skill 2" }).fill("instagram");
  await page.getByLabel("Work mode").selectOption("hybrid");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("Amount (₹)").fill("12000");
  await page.getByLabel("Requirements (optional)").fill("Must have a portfolio.");
  await page.getByLabel("Experience level (optional)").selectOption("junior");
  await page.getByLabel("Compensation min (₹, optional)").fill("10000");
  await page.getByLabel("Compensation max (₹, optional)").fill("20000");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await page
    .getByRole("article", { name: "Social media marketing intern" })
    .getByRole("button", { name: "Publish" })
    .click();

  await page.getByRole("link", { name: "New listing" }).click();
  await page.getByLabel("Title").fill("Secret draft listing");
  await page.getByLabel("Description").fill("Not published.");
  await page.getByLabel("Amount (₹)").fill("1000");
  await page.getByRole("button", { name: "Save as draft" }).click();
  const editUrl = await page
    .getByRole("article", { name: "Secret draft listing" })
    .getByRole("link", { name: "Edit" })
    .getAttribute("href");
  const draftId = editUrl?.split("/")[3];

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/opportunities?q=instagram");
  const card = visitor.getByRole("link", { name: /Social media marketing intern/ });
  await expect(card).toBeVisible();
  await expect(visitor.getByText("Secret draft listing")).toHaveCount(0);

  await card.click();
  await expect(
    visitor.getByRole("heading", { name: "Social media marketing intern" }),
  ).toBeVisible();
  await expect(visitor.getByText(business)).toBeVisible();
  await expect(visitor.getByText("Plan Instagram posts")).toBeVisible();
  await expect(visitor.getByText("Junior")).toBeVisible();
  await expect(visitor.getByText("₹10,000 – ₹20,000")).toBeVisible();
  await expect(visitor.getByText("Must have a portfolio.")).toBeVisible();

  await visitor.goto(`/opportunities/${draftId}`);
  await expect(
    visitor.getByRole("heading", { name: "This page could not be found" }),
  ).toBeVisible();

  await visitor.goto("/opportunities?type=freelance&q=instagram");
  await expect(visitor.getByText("No opportunities match.")).toBeVisible();
});
