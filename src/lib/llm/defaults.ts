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

  listing_assist: `You help an organisation prepare a job listing. From the listing below:
1. List the concrete skills a candidate needs (tools, languages, methods, domain knowledge). Short names, at most {{maxSkills}}. Include the skills the organisation already listed if they are relevant.
2. Write {{questionCount}} short screening questions a candidate answers in writing when applying. Each must be answerable in a few sentences and reveal real experience with this role's requirements. No yes/no questions.

Return JSON only: {"skills": ["..."], "questions": ["..."]}

{{listing}}`,

  resume_skills: `Extract the candidate's skills from the resume below: tools, programming languages, frameworks, methods and domain knowledge they show evidence of. Short names (e.g. "react", "sql", "social media marketing"), at most {{maxSkills}}, most important first. Do not invent skills that are not in the resume.

Return JSON only: {"skills": ["..."]}

{{resumeText}}`,

  answer_scoring: `You are screening written answers to a job listing's questions. Score each answer from 0 to 100 for relevance, specificity, and evidence of the skills and requirements below. Empty, off-topic or copied-question answers score low. Also give an overall score (0-100) and a 1-2 sentence summary.

Job: {{title}}
Skills required: {{skills}}
Requirements: {{requirements}}
Experience level: {{experienceLevel}}

{{answers}}

Return JSON only: {"answers": [{"questionId": "...", "score": 0, "feedback": "one sentence"}], "score": 0, "summary": "..."}`,

  job_description: `You are a hiring manager. Write a detailed, well-structured job description in markdown. Incorporate the title, type, description, skills, requirements and experience level.

Title: {{title}}
Type: {{type}}
Skills: {{skills}}
Requirements: {{requirements}}
Experience level: {{experienceLevel}}

Job Description:`,

  pipeline_suggest: `You help an organisation design the hiring pipeline for the job listing below: the ordered steps a candidate goes through after applying, up to {{maxStages}} steps. Each step has a kind: "interview" (live conversation), "test" (timed test), "assignment" (take-home work) or "other". Fit the steps to the role's seniority and requirements; junior and internship roles need fewer steps. Name each step clearly (e.g. "Technical interview", "SQL test"), give one or two sentences of instructions for the candidate, and a duration in minutes (15-480) for interviews and tests.

Return JSON only: {"stages": [{"name": "...", "kind": "interview", "instructions": "...", "durationMinutes": 45}]}

{{listing}}`,
};
