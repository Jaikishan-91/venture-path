-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('interview', 'test', 'assignment', 'other');

-- CreateEnum
CREATE TYPE "StageOutcome" AS ENUM ('passed', 'failed', 'moved');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('invited', 'active', 'deactivated');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('scheduled', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "CalendarSync" AS ENUM ('pending', 'synced', 'failed', 'disabled');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('pass', 'fail', 'unsure');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'hiring_manager';

-- AlterTable
ALTER TABLE "application" ADD COLUMN     "currentStageId" TEXT;

-- AlterTable
ALTER TABLE "opportunity" ADD COLUMN     "pipelineAssistedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pipeline_stage" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL,
    "instructions" TEXT,
    "externalUrl" TEXT,
    "durationMinutes" INTEGER,
    "source" "QuestionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_event" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "outcome" "StageOutcome" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_member" (
    "id" TEXT NOT NULL,
    "organisationProfileId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'invited',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_event" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'scheduled',
    "googleEventId" TEXT,
    "meetUrl" TEXT,
    "calendarSync" "CalendarSync" NOT NULL DEFAULT 'pending',
    "calendarError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_interviewer" (
    "scheduledEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "event_interviewer_pkey" PRIMARY KEY ("scheduledEventId","userId")
);

-- CreateTable
CREATE TABLE "interview_feedback" (
    "id" TEXT NOT NULL,
    "scheduledEventId" TEXT NOT NULL,
    "interviewerUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "notes" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stage_opportunityId_position_key" ON "pipeline_stage"("opportunityId", "position");

-- CreateIndex
CREATE INDEX "stage_event_applicationId_idx" ON "stage_event"("applicationId");

-- CreateIndex
CREATE INDEX "stage_event_stageId_idx" ON "stage_event"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_member_userId_key" ON "organisation_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_member_inviteTokenHash_key" ON "organisation_member"("inviteTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_member_organisationProfileId_email_key" ON "organisation_member"("organisationProfileId", "email");

-- CreateIndex
CREATE INDEX "scheduled_event_applicationId_idx" ON "scheduled_event"("applicationId");

-- CreateIndex
CREATE INDEX "scheduled_event_stageId_idx" ON "scheduled_event"("stageId");

-- CreateIndex
CREATE INDEX "scheduled_event_startsAt_idx" ON "scheduled_event"("startsAt");

-- CreateIndex
CREATE INDEX "event_interviewer_userId_idx" ON "event_interviewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_feedback_scheduledEventId_interviewerUserId_key" ON "interview_feedback"("scheduledEventId", "interviewerUserId");

-- CreateIndex
CREATE INDEX "application_currentStageId_idx" ON "application"("currentStageId");

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "pipeline_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_event" ADD CONSTRAINT "stage_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_member" ADD CONSTRAINT "organisation_member_organisationProfileId_fkey" FOREIGN KEY ("organisationProfileId") REFERENCES "organisation_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_member" ADD CONSTRAINT "organisation_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_event" ADD CONSTRAINT "scheduled_event_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_event" ADD CONSTRAINT "scheduled_event_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_event" ADD CONSTRAINT "scheduled_event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interviewer" ADD CONSTRAINT "event_interviewer_scheduledEventId_fkey" FOREIGN KEY ("scheduledEventId") REFERENCES "scheduled_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interviewer" ADD CONSTRAINT "event_interviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_scheduledEventId_fkey" FOREIGN KEY ("scheduledEventId") REFERENCES "scheduled_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interviewerUserId_fkey" FOREIGN KEY ("interviewerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
