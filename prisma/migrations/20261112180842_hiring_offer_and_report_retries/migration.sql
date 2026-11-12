-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- AlterTable
ALTER TABLE "application" ADD COLUMN     "notSelectedReason" TEXT,
ADD COLUMN     "offerMessage" TEXT,
ADD COLUMN     "offerRespondedAt" TIMESTAMP(3),
ADD COLUMN     "offerStartDate" DATE,
ADD COLUMN     "offerStatus" "OfferStatus",
ADD COLUMN     "offerStipendInr" INTEGER,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "offeredById" TEXT;

-- AlterTable
ALTER TABLE "interview_session" ADD COLUMN     "reportAttempts" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
