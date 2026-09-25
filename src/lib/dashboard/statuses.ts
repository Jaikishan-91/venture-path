/** Application statuses in display order, as in the `ApplicationStatus` enum in `prisma/schema.prisma`. */
export const APPLICATION_STATUSES = ["submitted", "accepted", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
