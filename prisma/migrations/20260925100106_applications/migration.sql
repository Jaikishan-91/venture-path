-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'accepted', 'rejected', 'withdrawn');

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "note" TEXT,
    "resumeFileName" TEXT NOT NULL,
    "resumeStorageKey" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_opportunityId_idx" ON "application"("opportunityId");

-- CreateIndex
CREATE INDEX "application_studentProfileId_idx" ON "application"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "application_opportunityId_studentProfileId_key" ON "application"("opportunityId", "studentProfileId");

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
