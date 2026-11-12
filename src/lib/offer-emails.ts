import "server-only";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { formatStartDate, formatStipend } from "./offer-schemas";

/** Emails for the offer step (plan 2026-11-12-hiring-and-ai-interview-v2, D2). Never include AI scores. */

export type OfferEmailKind = "offer_made" | "offer_withdrawn" | "offer_accepted" | "offer_declined";

async function loadOffer(applicationId: string) {
  return getDb().application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      offerMessage: true,
      offerStipendInr: true,
      offerStartDate: true,
      opportunity: {
        select: {
          id: true,
          title: true,
          organisationProfile: {
            select: { businessName: true, user: { select: { email: true } } },
          },
        },
      },
      userProfile: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

/** Sends the email for `kind`; failures are logged, never thrown. */
export async function sendOfferEmail(applicationId: string, kind: OfferEmailKind): Promise<void> {
  const logger = getLogger();
  try {
    const offer = await loadOffer(applicationId);
    const base = getEnv().BETTER_AUTH_URL;
    const studentUrl = `${base}/user/applications`;
    const ownerUrl = `${base}/organisation/opportunities/${offer.opportunity.id}/applicants/${applicationId}`;
    const business = offer.opportunity.organisationProfile;
    const title = offer.opportunity.title;
    const student = offer.userProfile.user;
    const details = [
      formatStipend(offer.offerStipendInr) && `Stipend: ${formatStipend(offer.offerStipendInr)}`,
      formatStartDate(offer.offerStartDate) &&
        `Start date: ${formatStartDate(offer.offerStartDate)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const messages = {
      offer_made: {
        to: student.email,
        subject: `Offer from ${business.businessName}: ${title}`,
        text:
          `Good news, ${student.name}! ${business.businessName} is offering you ${title}.\n\n` +
          `${offer.offerMessage ?? ""}\n\n${details ? `${details}\n\n` : ""}` +
          `Accept or decline the offer in My Applications:\n${studentUrl}`,
      },
      offer_withdrawn: {
        to: student.email,
        subject: `Offer update: ${title}`,
        text: `${business.businessName} has withdrawn its offer for ${title}.\n\n${studentUrl}`,
      },
      offer_accepted: {
        to: business.user.email,
        subject: `${student.name} accepted your offer: ${title}`,
        text:
          `${student.name} accepted your offer for ${title}. They're hired.\n\n` +
          `Their email: ${student.email}\n\n${ownerUrl}`,
      },
      offer_declined: {
        to: business.user.email,
        subject: `${student.name} declined your offer: ${title}`,
        text:
          `${student.name} declined your offer for ${title}.\n\n` +
          `You can make a new offer or mark them not selected:\n${ownerUrl}`,
      },
    } as const;
    await sendEmail(messages[kind]);
    if (kind === "offer_accepted") {
      // The student gets a confirmation with the business's contact.
      await sendEmail({
        to: student.email,
        subject: `You're hired: ${title}`,
        text:
          `You accepted ${business.businessName}'s offer for ${title}. Congratulations!\n\n` +
          `Contact them at ${business.user.email}.\n\n${studentUrl}`,
      });
    }
    logger.info({ applicationId, kind }, "offer email sent");
  } catch (err) {
    logger.error({ applicationId, kind, err }, "offer email failed");
  }
}
