-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('draft', 'open', 'judging', 'done');

-- CreateEnum
CREATE TYPE "ChallengePlacement" AS ENUM ('none', 'winner', 'runner_up');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('none', 'paid', 'hire_offered');

-- CreateEnum
CREATE TYPE "AiScoreStatus" AS ENUM ('pending', 'done', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ProofSource" AS ENUM ('manual', 'challenge', 'apply_task');

-- CreateEnum
CREATE TYPE "ProofLevel" AS ENUM ('added', 'checked', 'verified');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('chat', 'voice');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('invited', 'in_progress', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('strong', 'maybe', 'not_fit');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'done', 'failed');

-- AlterEnum
ALTER TYPE "StageKind" ADD VALUE 'ai_interview';

-- AlterTable
ALTER TABLE "application" ALTER COLUMN "resumeFileName" DROP NOT NULL,
ALTER COLUMN "resumeStorageKey" DROP NOT NULL;

-- AlterTable
ALTER TABLE "opportunity" ADD COLUMN     "applyTask" TEXT;

-- CreateTable
CREATE TABLE "challenge" (
    "id" TEXT NOT NULL,
    "organisationProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "goodSolution" TEXT,
    "criteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rewardMoneyInr" INTEGER,
    "rewardHire" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3) NOT NULL,
    "fileKey" TEXT,
    "fileName" TEXT,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'draft',
    "criteriaLockedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "aiAssistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_submission" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "aiScore" INTEGER,
    "aiScoreStatus" "AiScoreStatus" NOT NULL DEFAULT 'pending',
    "aiReason" TEXT,
    "aiQuote" TEXT,
    "aiBreakdown" JSONB,
    "aiModel" TEXT,
    "similarToId" TEXT,
    "placement" "ChallengePlacement" NOT NULL DEFAULT 'none',
    "rewardStatus" "RewardStatus" NOT NULL DEFAULT 'none',
    "hireMessage" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whatIDid" TEXT NOT NULL,
    "link" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "ProofSource" NOT NULL DEFAULT 'manual',
    "challengeSubmissionId" TEXT,
    "level" "ProofLevel" NOT NULL DEFAULT 'added',
    "aiScore" INTEGER,
    "aiScoreStatus" "AiScoreStatus" NOT NULL DEFAULT 'pending',
    "aiReason" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_session" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'invited',
    "mode" "InterviewMode",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "questions" JSONB NOT NULL,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "pasteCount" INTEGER NOT NULL DEFAULT 0,
    "tabLeaveCount" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "reportStatus" "ReportStatus",
    "recommendation" "InterviewRecommendation",
    "reportModel" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ApplicationToProof" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ApplicationToProof_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "challenge_organisationProfileId_idx" ON "challenge"("organisationProfileId");

-- CreateIndex
CREATE INDEX "challenge_status_deadline_idx" ON "challenge"("status", "deadline");

-- CreateIndex
CREATE INDEX "challenge_submission_userProfileId_idx" ON "challenge_submission"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_submission_challengeId_userProfileId_key" ON "challenge_submission"("challengeId", "userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "proof_challengeSubmissionId_key" ON "proof"("challengeSubmissionId");

-- CreateIndex
CREATE INDEX "proof_userProfileId_idx" ON "proof"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_tokenHash_key" ON "interview_session"("tokenHash");

-- CreateIndex
CREATE INDEX "interview_session_applicationId_idx" ON "interview_session"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_applicationId_stageId_key" ON "interview_session"("applicationId", "stageId");

-- CreateIndex
CREATE INDEX "_ApplicationToProof_B_index" ON "_ApplicationToProof"("B");

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_organisationProfileId_fkey" FOREIGN KEY ("organisationProfileId") REFERENCES "organisation_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_submission" ADD CONSTRAINT "challenge_submission_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_submission" ADD CONSTRAINT "challenge_submission_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_submission" ADD CONSTRAINT "challenge_submission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof" ADD CONSTRAINT "proof_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof" ADD CONSTRAINT "proof_challengeSubmissionId_fkey" FOREIGN KEY ("challengeSubmissionId") REFERENCES "challenge_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApplicationToProof" ADD CONSTRAINT "_ApplicationToProof_A_fkey" FOREIGN KEY ("A") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApplicationToProof" ADD CONSTRAINT "_ApplicationToProof_B_fkey" FOREIGN KEY ("B") REFERENCES "proof"("id") ON DELETE CASCADE ON UPDATE CASCADE;
