import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import {
  PASSWORD,
  clearRole,
  createPendingOrganisation,
  deleteE2eUsers,
  signInAdmin,
  signUpVerified,
  uniqueEmail,
} from "../e2e/helpers";

const OUT = process.env.CAPTURE_OUT!;
const manifest: { group: string; name: string; route: string; file: string }[] = [];

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function shot(page: Page, group: string, name: string, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(700);
  const file = `${String(manifest.length + 1).padStart(2, "0")}-${group}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  manifest.push({ group, name, route, file });
}

async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return ctx.newPage();
}

test.setTimeout(10 * 60_000);

test("capture every page", async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const [admin] = await sql<{ id: string }>(`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`);

  // Organisation: sign up, submit profile, capture pending state, then approve.
  const orgEmail = uniqueEmail("org");
  const org = await freshPage(browser);
  await createPendingOrganisation(org, orgEmail, "Kestrel Studio");
  await sql(`UPDATE "user" SET name='Rohan Kulkarni' WHERE email=$1`, [orgEmail]);
  await shot(org, "organisation", "dashboard-pending", "/organisation");

  // Admin reviews while the organisation is still pending.
  const adm = await freshPage(browser);
  await signInAdmin(adm);
  await shot(adm, "admin", "dashboard", "/admin");
  await shot(adm, "admin", "organisations", "/admin/organisations");
  await shot(adm, "admin", "settings", "/admin/settings");

  const [op] = await sql<{ id: string }>(
    `UPDATE organisation_profile SET status='approved', "reviewedById"=$2, "reviewedAt"=now(),
       description='Kestrel Studio is a 20-person product design studio in Pune building web and mobile apps for early-stage startups.',
       industry='Design & Technology', website='https://kestrel.example'
     WHERE "userId"=(SELECT id FROM "user" WHERE email=$1) RETURNING id`,
    [orgEmail, admin.id],
  );

  const opps = [
    ["internship", "Frontend Engineering Intern", "Build product UI in React and TypeScript alongside our design team.", "{React,TypeScript,CSS,Git}", "hybrid", "Pune", "paid", 20000, "month", "6 months", "junior", "published"],
    ["freelance", "Brand Illustration Set", "Create a set of 12 spot illustrations for our marketing site.", "{Illustration,Figma,Branding}", "remote", null, "paid", 45000, "fixed", "4 weeks", "mid", "published"],
    ["internship", "Content Marketing Intern", "Write blog posts and case studies about our client work.", "{Writing,SEO,Research}", "remote", null, "unpaid", null, null, "3 months", "entry", "draft"],
  ];
  const oppIds: string[] = [];
  for (const o of opps) {
    const [row] = await sql<{ id: string }>(
      `INSERT INTO opportunity (id,"organisationProfileId",type,title,description,skills,"workMode",city,"payType","payAmount","payPeriod",duration,"experienceLevel",status,"publishedAt",deadline,requirements,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2::"OpportunityType",$3,$4,$5::text[],$6::"WorkMode",$7,$8::"PayType",$9::int,$10::"PayPeriod",$11,$12::"ExperienceLevel",$13::"OpportunityStatus",
               CASE WHEN $13::text='published' THEN now() END, (now() + interval '30 days')::date,
               'Comfortable with modern tooling. Portfolio or GitHub link preferred.', now())
       RETURNING id`,
      [op.id, ...o],
    );
    oppIds.push(row.id);
  }
  const stageIds: string[] = [];
  for (const [i, s] of [["Portfolio review", "other"], ["Technical interview", "interview"], ["Take-home task", "assignment"]].entries()) {
    const [row] = await sql<{ id: string }>(
      `INSERT INTO pipeline_stage (id,"opportunityId",position,name,kind,"durationMinutes",source,instructions,"updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,45,'organisation','Bring examples of recent work.',now()) RETURNING id`,
      [oppIds[0], i, s[0], s[1]],
    );
    stageIds.push(row.id);
  }

  // User with profile, resume and an application in the interview stage.
  const userEmail = uniqueEmail("user");
  const usr = await freshPage(browser);
  await signUpVerified(usr, "user", userEmail);
  await sql(`UPDATE "user" SET name='Priya Sharma' WHERE email=$1`, [userEmail]);
  const [up] = await sql<{ id: string }>(
    `INSERT INTO user_profile (id,"userId",institution,course,"graduationYear",skills,bio,links,"updatedAt")
     SELECT gen_random_uuid(), id, 'COEP Technological University', 'B.Tech Computer Engineering', 2027,
            '{React,TypeScript,CSS,Figma}', 'Frontend developer who enjoys design systems.', '{https://github.com/example}', now()
     FROM "user" WHERE email=$1 RETURNING id`,
    [userEmail],
  );
  const [resume] = await sql<{ id: string }>(
    `INSERT INTO resume (id,"userProfileId","fileName","storageKey",skills,"skillsStatus","updatedAt")
     VALUES (gen_random_uuid(),$1,'priya-resume.pdf',gen_random_uuid()::text,'{React,TypeScript,Git,CSS}','done',now()) RETURNING id`,
    [up.id],
  );
  const [app] = await sql<{ id: string }>(
    `INSERT INTO application (id,"opportunityId","userProfileId",note,"resumeFileName","resumeStorageKey","resumeId","currentStageId","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,'Excited to work on design-led products.','priya-resume.pdf',gen_random_uuid()::text,$3,$4,now()) RETURNING id`,
    [oppIds[0], up.id, resume.id, stageIds[1]],
  );

  // Hiring manager: real account, promoted and attached to the organisation.
  const hmEmail = uniqueEmail("hm");
  const hmSetup = await freshPage(browser);
  await signUpVerified(hmSetup, "user", hmEmail);
  await hmSetup.context().close();
  const [hm] = await sql<{ id: string }>(
    `UPDATE "user" SET role='hiring_manager', name='Arjun Mehta' WHERE email=$1 RETURNING id`,
    [hmEmail],
  );
  await sql(
    `INSERT INTO organisation_member (id,"organisationProfileId","userId",email,name,status,"acceptedAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,$3,'Arjun Mehta','active',now(),now())`,
    [op.id, hm.id, hmEmail],
  );
  const [ev] = await sql<{ id: string }>(
    `INSERT INTO scheduled_event (id,"applicationId","stageId","startsAt","durationMinutes","calendarSync","createdById","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,now() + interval '2 days',45,'disabled',$3,now()) RETURNING id`,
    [app.id, stageIds[1], hm.id],
  );
  await sql(`INSERT INTO event_interviewer ("scheduledEventId","userId") VALUES ($1,$2)`, [ev.id, hm.id]);

  // Pending invite with a known token.
  const token = "figma-capture-invite-token";
  await sql(
    `INSERT INTO organisation_member (id,"organisationProfileId",email,name,status,"inviteTokenHash","inviteExpiresAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,'Neha Rao','invited',$3,now() + interval '7 days',now())`,
    [op.id, uniqueEmail("invitee"), createHash("sha256").update(token).digest("hex")],
  );

  // Public / signed-out pages.
  const pub = await freshPage(browser);
  await shot(pub, "public", "home", "/");
  await shot(pub, "public", "opportunities", "/opportunities");
  await shot(pub, "public", "opportunity-detail", `/opportunities/${oppIds[0]}`);
  await shot(pub, "auth", "user-sign-in", "/sign-in");
  await shot(pub, "auth", "user-sign-up", "/sign-up");
  await shot(pub, "auth", "organisation-sign-in", "/organisation/sign-in");
  await shot(pub, "auth", "organisation-sign-up", "/organisation/sign-up");
  await shot(pub, "auth", "admin-sign-in", "/admin/sign-in");
  await shot(pub, "auth", "hiring-manager-sign-in", "/hiring-manager/sign-in");
  await shot(pub, "auth", "invite", `/invite/${token}`);

  // User pages.
  await shot(usr, "user", "dashboard", "/user");
  await shot(usr, "user", "profile", "/user/profile");
  await shot(usr, "user", "resumes", "/user/resumes");
  await shot(usr, "user", "recommendations", "/user/recommendations");
  await shot(usr, "user", "applications", "/user/applications");

  // Organisation pages (approved).
  await shot(org, "organisation", "dashboard", "/organisation");
  await shot(org, "organisation", "profile", "/organisation/profile");
  await shot(org, "organisation", "opportunities", "/organisation/opportunities");
  await shot(org, "organisation", "opportunity-new", "/organisation/opportunities/new");
  await shot(org, "organisation", "opportunity-edit", `/organisation/opportunities/${oppIds[0]}/edit`);
  await shot(org, "organisation", "applicants", `/organisation/opportunities/${oppIds[0]}/applicants`);
  await shot(org, "organisation", "team", "/organisation/team");

  // Hiring manager pages.
  const hmp = await freshPage(browser);
  await hmp.goto("/hiring-manager/sign-in");
  await hmp.getByLabel("Email").fill(hmEmail);
  await hmp.getByLabel("Password").fill(PASSWORD);
  await hmp.getByRole("button", { name: "Sign in" }).click();
  await hmp.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 15_000 });
  await shot(hmp, "hiring-manager", "dashboard", "/hiring-manager");
  await shot(hmp, "hiring-manager", "interviews", "/hiring-manager/interviews");
  await shot(hmp, "hiring-manager", "interview-detail", `/hiring-manager/interviews/${ev.id}`);
  await sql(`UPDATE organisation_member SET status='deactivated', "deactivatedAt"=now() WHERE "userId"=$1`, [hm.id]);
  await shot(hmp, "hiring-manager", "inactive", "/hiring-manager/inactive");

  // Onboarding: a signed-in account with no role yet.
  const onbEmail = uniqueEmail("onboard");
  const onb = await freshPage(browser);
  await signUpVerified(onb, "user", onbEmail);
  await clearRole(onbEmail);
  await shot(onb, "onboarding", "choose-role", "/onboarding/role");

  // Admin after approval.
  await shot(adm, "admin", "organisations-approved", "/admin/organisations");

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
});

test.afterAll(async () => {
  await deleteE2eUsers();
});
