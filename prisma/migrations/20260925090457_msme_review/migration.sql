-- AlterTable
ALTER TABLE "msme_profile" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AddForeignKey
ALTER TABLE "msme_profile" ADD CONSTRAINT "msme_profile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
