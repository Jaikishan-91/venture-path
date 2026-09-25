-- The phase7 seed wrote '\n' in standard SQL strings, which Postgres stores as a literal
-- backslash and "n". Turn them into real newlines in prompts no admin has edited yet.
UPDATE "prompt" SET "content" = replace("content", '\n', E'\n') WHERE "updatedById" IS NULL;
