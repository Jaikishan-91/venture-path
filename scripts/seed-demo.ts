import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role } from "../src/generated/prisma/client";
import { getDb } from "../src/lib/db";
import { refreshOpportunityEmbedding } from "../src/lib/search";

/**
 * Demo data for the docs/PRODUCT.md §8 story: one approved MSME (Sharma Sweets), three students
 * with proof cards, an open challenge with two submissions, and an internship whose pipeline has
 * an AI interview stage. Safe to re-run: existing demo accounts are left as they are.
 * Every account uses DEMO_PASSWORD (default below); addresses are on `.test`, so mail goes to Mailpit.
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-2026";
const DAY = 24 * 60 * 60 * 1000;

async function account(email: string, name: string, role: Role): Promise<string | null> {
  const db = getDb();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return null;
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name,
      email,
      emailVerified: true,
      role,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(PASSWORD),
        },
      },
    },
  });
  return id;
}

const STUDENTS = [
  {
    email: "priya@demo.test",
    name: "Priya Sharma",
    institution: "Govt. Polytechnic, Indore",
    course: "Diploma in Commerce",
    skills: ["social media marketing", "canva", "content writing"],
    proofs: [
      {
        title: "Instagram page for my uncle's sweet shop",
        whatIDid:
          "Ran the page for 4 months: planned 30 posts, shot product reels on my phone, and grew it from 120 to 1,900 followers.",
        link: "https://www.instagram.com/",
        skills: ["social media marketing", "content writing"],
      },
      {
        title: "Diwali offer poster set",
        whatIDid:
          "Designed 5 Canva posters for a Diwali combo offer; the shop used them on WhatsApp status.",
        link: "https://www.canva.com/",
        skills: ["canva"],
      },
    ],
  },
  {
    email: "rahul@demo.test",
    name: "Rahul Verma",
    institution: "SGSITS, Indore",
    course: "B.Com",
    skills: ["excel", "social media marketing"],
    proofs: [
      {
        title: "Stock tracker in Excel",
        whatIDid:
          "Built a stock sheet with reorder alerts for a kirana store using formulas and conditional formatting.",
        link: null,
        skills: ["excel"],
      },
    ],
  },
  {
    email: "ankit@demo.test",
    name: "Ankit Patel",
    institution: "IPS Academy, Indore",
    course: "BBA",
    skills: ["content writing"],
    proofs: [],
  },
] as const;

async function main() {
  const db = getDb();

  // Organisation: approved, so it can publish straight away.
  const ownerId = await account("owner@sharma-sweets.test", "Ramesh Sharma", "organisation");
  if (ownerId) {
    await db.organisationProfile.create({
      data: {
        userId: ownerId,
        businessName: "Sharma Sweets",
        description: "Family sweet shop in Indore since 1998, selling mithai and namkeen.",
        industry: "Food & retail",
        location: "Indore",
        status: "approved",
        reviewedAt: new Date(),
      },
    });
  }
  const org = await db.organisationProfile.findFirstOrThrow({
    where: { user: { email: "owner@sharma-sweets.test" } },
  });

  // Students with proof cards.
  const profiles: Record<string, string> = {};
  for (const student of STUDENTS) {
    const userId = await account(student.email, student.name, "user");
    if (userId) {
      const profile = await db.userProfile.create({
        data: {
          userId,
          institution: student.institution,
          course: student.course,
          graduationYear: 2027,
          skills: [...student.skills],
          links: [],
        },
      });
      for (const proof of student.proofs) {
        await db.proof.create({
          data: {
            userProfileId: profile.id,
            title: proof.title,
            whatIDid: proof.whatIDid,
            link: proof.link,
            skills: [...proof.skills],
          },
        });
      }
    }
    const profile = await db.userProfile.findFirstOrThrow({
      where: { user: { email: student.email } },
    });
    profiles[student.email] = profile.id;
  }

  // Challenge: open, ₹2,000 + hire, two submissions already in (Priya submits live in the demo).
  const title = "Our Instagram gets no customers";
  let challenge = await db.challenge.findFirst({ where: { organisationProfileId: org.id, title } });
  if (!challenge) {
    challenge = await db.challenge.create({
      data: {
        organisationProfileId: org.id,
        title,
        problem:
          "We post photos of our sweets on Instagram every week but almost nobody visits the shop because of it. We want more people in Indore to come in, especially before festivals.",
        goodSolution: "A simple 2-week plan we can follow ourselves, with example posts.",
        criteria: [
          "Practical for a small shop with no marketing staff",
          "Clear, specific post ideas",
          "Brings people to the shop, not just likes",
        ],
        rewardMoneyInr: 2000,
        rewardHire: true,
        deadline: new Date(Date.now() + 5 * DAY),
        status: "open",
        publishedAt: new Date(),
      },
    });
    for (const [email, text] of [
      [
        "rahul@demo.test",
        "Post daily at 7pm. Use hashtags like #indorefood #sweets. Run a giveaway for followers.",
      ],
      [
        "ankit@demo.test",
        "Make reels showing sweets being made. Ask customers to tag the shop and give 5% off for a story tag. Post the festival menu 10 days before Diwali.",
      ],
    ] as const) {
      await db.challengeSubmission.create({
        data: { challengeId: challenge.id, userProfileId: profiles[email], text },
      });
    }
  }

  // Internship with a pipeline that includes the AI interview.
  const jobTitle = "Social Media Intern";
  let job = await db.opportunity.findFirst({
    where: { organisationProfileId: org.id, title: jobTitle },
  });
  if (!job) {
    job = await db.opportunity.create({
      data: {
        organisationProfileId: org.id,
        type: "internship",
        title: jobTitle,
        description:
          "Run our Instagram and WhatsApp updates: plan posts, shoot simple reels in the shop, and reply to customer messages. 3 months, part-time.",
        skills: ["social media marketing", "content writing", "canva"],
        workMode: "hybrid",
        city: "Indore",
        payType: "paid",
        payAmount: 6000,
        payPeriod: "month",
        duration: "3 months",
        experienceLevel: "entry",
        deadline: new Date(Date.now() + 14 * DAY),
        status: "published",
        publishedAt: new Date(),
        stages: {
          create: [
            {
              position: 0,
              name: "AI interview",
              kind: "ai_interview",
              instructions:
                "A short chat (or voice) interview with our AI assistant. About 15 minutes.",
              source: "organisation",
            },
            {
              position: 1,
              name: "Meet the owner",
              kind: "interview",
              instructions: "A 20-minute video call with Ramesh.",
              durationMinutes: 20,
              source: "organisation",
            },
          ],
        },
      },
    });
    await refreshOpportunityEmbedding(job.id);
  }

  console.log(`Demo ready. Password for every demo account: ${PASSWORD}
  Organisation: owner@sharma-sweets.test (approved)
  Students:     priya@demo.test, rahul@demo.test, ankit@demo.test
  Challenge:    "${challenge.title}" (open, 2 submissions)
  Job:          "${job.title}" (AI interview → Meet the owner)`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
