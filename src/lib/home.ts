import "server-only";
import { getDb } from "./db";
import { visibleOpportunityWhere } from "./search";

/** Live counts for the landing page; same visibility rules as the public lists. */
export async function getHomeStats() {
  const db = getDb();
  const [jobs, businesses] = await Promise.all([
    db.opportunity.count({ where: visibleOpportunityWhere() }),
    db.organisationProfile.count({ where: { status: "approved" } }),
  ]);
  return { jobs, businesses };
}
