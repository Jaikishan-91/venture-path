import "server-only";
import { runInBackground } from "./background";
import { compareByScore, formatReward, readBreakdown } from "./challenge-schemas";
import { refreshExpiredChallenges, type ChallengeResult } from "./challenges";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import type { HireOfferInput } from "./challenge-schemas";
import type { ChallengeFailure, ChallengePlacement } from "./v2/types";

const fail = (reason: ChallengeFailure, message?: string) =>
  ({ ok: false, reason, ...(message ? { message } : {}) }) as const;

const ownedBy = (userId: string) => ({ organisationProfile: { userId } });

// ---------------------------------------------------------------------------------------------
// Organisation views
// ---------------------------------------------------------------------------------------------

/** Submissions of the organisation's challenge, highest AI score first (unscored last). */
export async function listChallengeSubmissions(userId: string, challengeId: string) {
  await refreshExpiredChallenges();
  const challenge = await getDb().challenge.findFirst({
    where: { id: challengeId, ...ownedBy(userId) },
    include: {
      submissions: {
        select: {
          id: true,
          text: true,
          aiScore: true,
          aiScoreStatus: true,
          aiReason: true,
          aiQuote: true,
          similarToId: true,
          placement: true,
          rewardStatus: true,
          submittedAt: true,
          updatedAt: true,
          userProfile: { select: { institution: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!challenge) return null;
  const flagged = new Set<string>();
  for (const submission of challenge.submissions) {
    if (submission.similarToId) {
      flagged.add(submission.id);
      flagged.add(submission.similarToId);
    }
  }
  const submissions = [...challenge.submissions]
    .sort(compareByScore)
    .map((submission) => ({ ...submission, similar: flagged.has(submission.id) }));
  return { challenge, submissions };
}

/** One submission of the organisation's challenge, with the AI breakdown. */
export async function getChallengeSubmission(
  userId: string,
  challengeId: string,
  submissionId: string,
) {
  await refreshExpiredChallenges();
  const submission = await getDb().challengeSubmission.findFirst({
    where: { id: submissionId, challengeId, challenge: ownedBy(userId) },
    include: {
      challenge: true,
      userProfile: {
        select: { institution: true, course: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!submission) return null;
  const similarTo = submission.similarToId
    ? submission.similarToId
    : ((
        await getDb().challengeSubmission.findFirst({
          where: { challengeId, similarToId: submissionId },
          select: { id: true },
        })
      )?.id ?? null);
  return { ...submission, breakdown: readBreakdown(submission.aiBreakdown), similarTo };
}

// ---------------------------------------------------------------------------------------------
// Judging and reward
// ---------------------------------------------------------------------------------------------

async function loadForDecision(userId: string, challengeId: string, submissionId: string) {
  await refreshExpiredChallenges();
  return getDb().challengeSubmission.findFirst({
    where: { id: submissionId, challengeId, challenge: ownedBy(userId) },
    select: {
      id: true,
      placement: true,
      rewardStatus: true,
      proof: { select: { id: true } },
      challenge: {
        select: { id: true, status: true, rewardMoneyInr: true, rewardHire: true },
      },
    },
  });
}

/**
 * Pick a submission as winner or runner-up (one of each), or remove its placement (`none`).
 * Only while judging. A placement whose reward is already recorded can't change. Placing turns
 * the challenge proof 🟢 verified; removing it turns it back to added. The student is emailed.
 */
export async function setPlacement(
  userId: string,
  challengeId: string,
  submissionId: string,
  placement: ChallengePlacement,
): Promise<ChallengeResult> {
  const submission = await loadForDecision(userId, challengeId, submissionId);
  if (!submission) return fail("not_found");
  if (submission.challenge.status !== "judging") return fail("wrong_status");
  if (submission.placement === placement) return { ok: true };
  if (submission.rewardStatus !== "none") {
    return fail(
      "invalid",
      "The reward for this student is already recorded, so this can't change.",
    );
  }

  const db = getDb();
  const now = new Date();
  const outcome = await db.$transaction(async (tx) => {
    if (placement !== "none") {
      // Someone else holding this placement loses it, unless their reward is already recorded.
      const holder = await tx.challengeSubmission.findFirst({
        where: { challengeId, placement, id: { not: submissionId } },
        select: { id: true, rewardStatus: true },
      });
      if (holder && holder.rewardStatus !== "none") return "holder_rewarded" as const;
      if (holder) {
        await tx.challengeSubmission.update({
          where: { id: holder.id },
          data: { placement: "none", decidedById: userId, decidedAt: now },
        });
        await tx.proof.updateMany({
          where: { challengeSubmissionId: holder.id, source: "challenge" },
          data: { level: "added" },
        });
      }
    }
    await tx.challengeSubmission.update({
      where: { id: submissionId },
      data: { placement, decidedById: userId, decidedAt: now },
    });
    await tx.proof.updateMany({
      where: { challengeSubmissionId: submissionId, source: "challenge" },
      data: { level: placement === "none" ? "added" : "verified" },
    });
    return "ok" as const;
  });
  if (outcome === "holder_rewarded") {
    return fail(
      "invalid",
      `The ${placement === "winner" ? "winner" : "runner-up"} already has their reward recorded.`,
    );
  }

  getLogger().info({ userId, challengeId, submissionId, placement }, "challenge placement set");
  if (placement !== "none") {
    runInBackground("challenge placement email", { submissionId }, () =>
      sendPlacementEmail(submissionId),
    );
  }
  return { ok: true };
}

/** Money reward, paid outside the app (UPI/cash): the winner is marked paid. */
export async function markRewardPaid(
  userId: string,
  challengeId: string,
  submissionId: string,
): Promise<ChallengeResult> {
  const submission = await loadForDecision(userId, challengeId, submissionId);
  if (!submission) return fail("not_found");
  if (submission.challenge.rewardMoneyInr === null) {
    return fail("invalid", "This challenge has no money reward.");
  }
  if (submission.placement !== "winner")
    return fail("invalid", "Pick this student as winner first.");
  if (submission.challenge.status !== "judging") return fail("wrong_status");
  if (submission.rewardStatus !== "none") return { ok: true };

  const { count } = await getDb().challengeSubmission.updateMany({
    where: { id: submissionId, placement: "winner", rewardStatus: "none" },
    data: { rewardStatus: "paid", decidedById: userId, decidedAt: new Date() },
  });
  if (count === 0) return fail("wrong_status");
  getLogger().info({ userId, challengeId, submissionId }, "challenge reward marked paid");
  return { ok: true };
}

/**
 * Hire reward: email the winner (or runner-up) the owner's message and an optional link to one of
 * the organisation's published listings. When the challenge also has a money reward, the winner
 * must be marked paid first, so `hire_offered` on a winner always means the money is paid too.
 */
export async function offerHire(
  userId: string,
  challengeId: string,
  submissionId: string,
  input: HireOfferInput,
): Promise<ChallengeResult> {
  const submission = await loadForDecision(userId, challengeId, submissionId);
  if (!submission) return fail("not_found");
  const { challenge } = submission;
  if (!challenge.rewardHire) return fail("invalid", "This challenge has no hiring reward.");
  if (submission.placement === "none") {
    return fail("invalid", "Pick this student as winner or runner-up first.");
  }
  if (challenge.status !== "judging") return fail("wrong_status");
  if (submission.rewardStatus === "hire_offered") return { ok: true };
  const moneyDue =
    submission.placement === "winner" &&
    challenge.rewardMoneyInr !== null &&
    submission.rewardStatus !== "paid";
  if (moneyDue) return fail("reward_unpaid", "Mark the money reward as paid first.");

  let listingId: string | null = null;
  if (input.opportunityId) {
    const listing = await getDb().opportunity.findFirst({
      where: { id: input.opportunityId, status: "published", ...ownedBy(userId) },
      select: { id: true },
    });
    if (!listing) return fail("invalid", "Choose one of your published listings.");
    listingId = listing.id;
  }

  const { count } = await getDb().challengeSubmission.updateMany({
    where: {
      id: submissionId,
      rewardStatus: submission.rewardStatus,
      placement: submission.placement,
    },
    data: {
      rewardStatus: "hire_offered",
      hireMessage: input.message || null,
      decidedById: userId,
      decidedAt: new Date(),
    },
  });
  if (count === 0) return fail("wrong_status");
  getLogger().info({ userId, challengeId, submissionId, listingId }, "challenge hire offered");
  runInBackground("challenge hire email", { submissionId }, () =>
    sendHireEmail(submissionId, listingId),
  );
  return { ok: true };
}

/**
 * Close the challenge (judging → done). Needs a winner when anyone submitted, and a money reward
 * marked paid. Everyone not placed gets a "not selected" email.
 */
export async function closeChallenge(
  userId: string,
  challengeId: string,
): Promise<ChallengeResult> {
  await refreshExpiredChallenges();
  const challenge = await getDb().challenge.findFirst({
    where: { id: challengeId, ...ownedBy(userId) },
    select: {
      status: true,
      rewardMoneyInr: true,
      submissions: { select: { placement: true, rewardStatus: true } },
    },
  });
  if (!challenge) return fail("not_found");
  if (challenge.status !== "judging") return fail("wrong_status");
  const winner = challenge.submissions.find((submission) => submission.placement === "winner");
  if (challenge.submissions.length > 0 && !winner) {
    return fail("invalid", "Pick a winner before closing the challenge.");
  }
  if (winner && challenge.rewardMoneyInr !== null && winner.rewardStatus === "none") {
    return fail("reward_unpaid");
  }

  const { count } = await getDb().challenge.updateMany({
    where: { id: challengeId, status: "judging", ...ownedBy(userId) },
    data: { status: "done", closedAt: new Date() },
  });
  if (count === 0) return fail("wrong_status");
  getLogger().info({ userId, challengeId }, "challenge closed");
  runInBackground("challenge not-selected emails", { challengeId }, () =>
    sendNotSelectedEmails(challengeId),
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Emails (sent in the background; failures are logged)
// ---------------------------------------------------------------------------------------------

const challengeUrl = (challengeId: string) =>
  `${getEnv().BETTER_AUTH_URL}/challenges/${challengeId}`;

function loadForEmail(submissionId: string) {
  return getDb().challengeSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      placement: true,
      hireMessage: true,
      userProfile: { select: { user: { select: { name: true, email: true } } } },
      challenge: {
        select: {
          id: true,
          title: true,
          rewardMoneyInr: true,
          rewardHire: true,
          organisationProfile: {
            select: { businessName: true, user: { select: { email: true } } },
          },
        },
      },
    },
  });
}

/** The winner / runner-up email, with what happens next. Pure, for tests. */
export function placementEmail(data: {
  studentName: string;
  placement: "winner" | "runner_up";
  challengeTitle: string;
  businessName: string;
  reward: string;
  hasMoney: boolean;
  url: string;
}) {
  const won = data.placement === "winner";
  const lines = [
    `Hi ${data.studentName},`,
    "",
    won
      ? `${data.businessName} picked your solution as the winner of "${data.challengeTitle}".`
      : `${data.businessName} picked your solution as the runner-up in "${data.challengeTitle}".`,
  ];
  if (won && data.hasMoney) {
    lines.push("", `Reward: ${data.reward}. The business pays it directly (UPI or cash).`);
  }
  lines.push("", "This now shows as a Verified proof card on your profile.", "", data.url);
  return {
    subject: won
      ? `You won: ${data.challengeTitle}`
      : `You're the runner-up: ${data.challengeTitle}`,
    text: lines.join("\n"),
  };
}

async function sendPlacementEmail(submissionId: string) {
  const submission = await loadForEmail(submissionId);
  if (submission.placement === "none") return;
  const { challenge } = submission;
  const message = placementEmail({
    studentName: submission.userProfile.user.name,
    placement: submission.placement,
    challengeTitle: challenge.title,
    businessName: challenge.organisationProfile.businessName,
    reward: formatReward(challenge),
    hasMoney: challenge.rewardMoneyInr !== null,
    url: challengeUrl(challenge.id),
  });
  await sendEmail({ to: submission.userProfile.user.email, ...message });
  getLogger().info({ submissionId }, "challenge placement email sent");
}

async function sendHireEmail(submissionId: string, listingId: string | null) {
  const submission = await loadForEmail(submissionId);
  const { challenge } = submission;
  const business = challenge.organisationProfile;
  const lines = [
    `Hi ${submission.userProfile.user.name},`,
    "",
    `${business.businessName} would like to hire you after your solution to "${challenge.title}".`,
  ];
  if (submission.hireMessage) lines.push("", `Their message:`, submission.hireMessage);
  if (listingId) {
    lines.push("", "Apply here:", `${getEnv().BETTER_AUTH_URL}/opportunities/${listingId}`);
  }
  lines.push("", `Reply to them at ${business.user.email}.`);
  await sendEmail({
    to: submission.userProfile.user.email,
    subject: `Hiring offer from ${business.businessName}`,
    text: lines.join("\n"),
  });
  getLogger().info({ submissionId }, "challenge hire email sent");
}

async function sendNotSelectedEmails(challengeId: string) {
  const challenge = await getDb().challenge.findUniqueOrThrow({
    where: { id: challengeId },
    select: {
      title: true,
      organisationProfile: { select: { businessName: true } },
      submissions: {
        where: { placement: "none" },
        select: {
          id: true,
          userProfile: { select: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  for (const submission of challenge.submissions) {
    const { name, email } = submission.userProfile.user;
    try {
      await sendEmail({
        to: email,
        subject: `Challenge result: ${challenge.title}`,
        text: [
          `Hi ${name},`,
          "",
          `${challenge.organisationProfile.businessName} has closed "${challenge.title}". Your solution wasn't selected this time.`,
          "",
          "Your submission stays on your profile as a proof card. Thank you for taking part.",
          "",
          challengeUrl(challengeId),
        ].join("\n"),
      });
    } catch (err) {
      getLogger().error(
        { challengeId, submissionId: submission.id, err },
        "not-selected email failed",
      );
    }
  }
  getLogger().info(
    { challengeId, count: challenge.submissions.length },
    "challenge result emails sent",
  );
}
