-- Rename MSME -> organisation and student -> user (ADR-025). Renames only; data is kept.

-- Enums
ALTER TYPE "Role" RENAME VALUE 'student' TO 'user';
ALTER TYPE "Role" RENAME VALUE 'msme' TO 'organisation';
ALTER TYPE "MsmeStatus" RENAME TO "OrganisationStatus";

-- student_profile -> user_profile
ALTER TABLE "student_profile" RENAME TO "user_profile";
ALTER TABLE "user_profile" RENAME CONSTRAINT "student_profile_pkey" TO "user_profile_pkey";
ALTER TABLE "user_profile" RENAME CONSTRAINT "student_profile_userId_fkey" TO "user_profile_userId_fkey";
ALTER INDEX "student_profile_userId_key" RENAME TO "user_profile_userId_key";

-- msme_profile -> organisation_profile
ALTER TABLE "msme_profile" RENAME TO "organisation_profile";
ALTER TABLE "organisation_profile" RENAME CONSTRAINT "msme_profile_pkey" TO "organisation_profile_pkey";
ALTER TABLE "organisation_profile" RENAME CONSTRAINT "msme_profile_userId_fkey" TO "organisation_profile_userId_fkey";
ALTER TABLE "organisation_profile" RENAME CONSTRAINT "msme_profile_reviewedById_fkey" TO "organisation_profile_reviewedById_fkey";
ALTER INDEX "msme_profile_userId_key" RENAME TO "organisation_profile_userId_key";
ALTER INDEX "msme_profile_status_idx" RENAME TO "organisation_profile_status_idx";

-- opportunity.msmeProfileId -> organisationProfileId
ALTER TABLE "opportunity" RENAME COLUMN "msmeProfileId" TO "organisationProfileId";
ALTER TABLE "opportunity" RENAME CONSTRAINT "opportunity_msmeProfileId_fkey" TO "opportunity_organisationProfileId_fkey";
ALTER INDEX "opportunity_msmeProfileId_idx" RENAME TO "opportunity_organisationProfileId_idx";

-- application.studentProfileId -> userProfileId
ALTER TABLE "application" RENAME COLUMN "studentProfileId" TO "userProfileId";
ALTER TABLE "application" RENAME CONSTRAINT "application_studentProfileId_fkey" TO "application_userProfileId_fkey";
ALTER INDEX "application_studentProfileId_idx" RENAME TO "application_userProfileId_idx";
ALTER INDEX "application_opportunityId_studentProfileId_key" RENAME TO "application_opportunityId_userProfileId_key";
