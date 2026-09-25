/** Default prompt templates, used when the admin hasn't customized them or the DB is empty. */

export const DEFAULT_PROMPTS = {
  resume_analysis: `You are a hiring assistant. Analyze the following resume text against the job listing below. Return JSON only with keys: score (0-100), summary (2-3 sentences), matchedSkills (array of job skills the candidate has), missingSkills (array of job skills the candidate lacks).

Job: {{title}}
Type: {{type}}
Description: {{description}}
Skills required: {{skills}}
Requirements: {{requirements}}
Experience level: {{experienceLevel}}

Resume:
{{resumeText}}`,

  job_description: `You are a hiring manager. Write a detailed, well-structured job description in markdown. Incorporate the title, type, description, skills, requirements and experience level.

Title: {{title}}
Type: {{type}}
Skills: {{skills}}
Requirements: {{requirements}}
Experience level: {{experienceLevel}}

Job Description:`,
};
