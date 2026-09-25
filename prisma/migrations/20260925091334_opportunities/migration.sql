-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('freelance', 'internship');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('remote', 'onsite', 'hybrid');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('paid', 'unpaid');

-- CreateEnum
CREATE TYPE "PayPeriod" AS ENUM ('fixed', 'month', 'hour');

-- CreateTable
CREATE TABLE "opportunity" (
    "id" TEXT NOT NULL,
    "msmeProfileId" TEXT NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skills" TEXT[],
    "workMode" "WorkMode" NOT NULL,
    "city" TEXT,
    "payType" "PayType" NOT NULL,
    "payAmount" INTEGER,
    "payPeriod" "PayPeriod",
    "duration" TEXT,
    "deadline" DATE,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_msmeProfileId_idx" ON "opportunity"("msmeProfileId");

-- CreateIndex
CREATE INDEX "opportunity_status_idx" ON "opportunity"("status");

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_msmeProfileId_fkey" FOREIGN KEY ("msmeProfileId") REFERENCES "msme_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
