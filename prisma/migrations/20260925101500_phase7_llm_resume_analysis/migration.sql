-- Phase 7: OpenAI-compatible LLM provider, resume analysis & job lifecycle extensions

-- CreateEnum for ExperienceLevel
CREATE TYPE "ExperienceLevel" AS ENUM ('entry', 'junior', 'mid', 'senior', 'lead');

-- AlterTable: Opportunity
ALTER TABLE "opportunity" ADD COLUMN     "requirements" TEXT;
ALTER TABLE "opportunity" ADD COLUMN     "experienceLevel" "ExperienceLevel";
ALTER TABLE "opportunity" ADD COLUMN     "compensationMin" INTEGER;
ALTER TABLE "opportunity" ADD COLUMN     "compensationMax" INTEGER;

-- CreateTable: Prompt (admin-editable LLM prompts)
CREATE TABLE "prompt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Analysis (per-application resume analysis)
CREATE TABLE "analysis" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT,
    "matchedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: prompt.key unique
CREATE UNIQUE INDEX "prompt_key_key" ON "prompt"("key");

-- CreateIndex: analysis.applicationId unique
CREATE UNIQUE INDEX "analysis_applicationId_key" ON "analysis"("applicationId");

-- AddForeignKey: prompt.updatedById -> user
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: analysis.applicationId -> application
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default prompts
INSERT INTO "prompt" ("id", "key", "name", "content", "updatedAt") VALUES
(gen_random_uuid(), 'resume_analysis', 'Resume Analysis Prompt', 'You are a hiring assistant. Analyze the following resume text against the job listing below. Return JSON only.\n\nJob: {{title}}\nType: {{type}}\nDescription: {{description}}\nSkills: {{skills}}\nRequirements: {{requirements}}\nExperience: {{experienceLevel}}\n\nResume:\n{{resumeText}}\n\nOutput JSON with keys: score (0-100), summary (2-3 sentences), matchedSkills (array of skills from the job that the candidate has), missingSkills (array of skills from the job that the candidate lacks).', NOW()),
(gen_random_uuid(), 'job_description', 'Job Description Prompt', 'You are a hiring manager. The user wants to post a job. Generate a detailed, well-structured job description incorporating the title, type, description, skills, requirements and experience level. Return markdown only.\n\nTitle: {{title}}\nType: {{type}}\nSkills: {{skills}}\nRequirements: {{requirements}}\nExperience: {{experienceLevel}}\n\nJob Description:', NOW());
