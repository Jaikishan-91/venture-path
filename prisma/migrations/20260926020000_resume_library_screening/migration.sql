-- CreateEnum
CREATE TYPE "ResumeSkillsStatus" AS ENUM ('pending', 'done', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('ai', 'organisation');

-- AlterTable
-- Keep existing scores: the old resume-only score becomes resumeScore, and also the overall score.
ALTER TABLE "analysis" RENAME COLUMN "score" TO "resumeScore";
ALTER TABLE "analysis" ALTER COLUMN "resumeScore" DROP NOT NULL,
ADD COLUMN     "answersScore" INTEGER,
ADD COLUMN     "answersSummary" TEXT,
ADD COLUMN     "overallScore" INTEGER;
UPDATE "analysis" SET "overallScore" = "resumeScore";

-- AlterTable
ALTER TABLE "application" ADD COLUMN     "resumeId" TEXT;

-- AlterTable
ALTER TABLE "opportunity" ADD COLUMN     "aiAssistedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "resume" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillsStatus" "ResumeSkillsStatus" NOT NULL DEFAULT 'pending',
    "skillsModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_question" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,

    CONSTRAINT "application_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_storageKey_key" ON "resume"("storageKey");

-- CreateIndex
CREATE INDEX "resume_userProfileId_idx" ON "resume"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_question_opportunityId_position_key" ON "opportunity_question"("opportunityId", "position");

-- CreateIndex
CREATE INDEX "application_answer_questionId_idx" ON "application_answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "application_answer_applicationId_questionId_key" ON "application_answer"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "analysis_overallScore_idx" ON "analysis"("overallScore");

-- CreateIndex
CREATE INDEX "application_resumeId_idx" ON "application"("resumeId");

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume" ADD CONSTRAINT "resume_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_question" ADD CONSTRAINT "opportunity_question_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answer" ADD CONSTRAINT "application_answer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answer" ADD CONSTRAINT "application_answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "opportunity_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
