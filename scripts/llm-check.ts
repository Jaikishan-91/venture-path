import "dotenv/config";
import { parseJsonObject } from "../src/lib/llm/json";
import { createLlmClient } from "../src/lib/llm/provider";

/** One live call through the app's LLM client: model, latency, and whether the JSON parses. */
async function main() {
  const client = createLlmClient();
  if (!client) {
    console.log("LLM is disabled or misconfigured (check LLM_* in .env).");
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const content = await client.chat([
    { role: "system", content: "Reply with a single JSON object only." },
    {
      role: "user",
      content:
        'Write 6 short interview questions for a social media intern at a sweet shop as {"questions":[{"text":"..."}]}',
    },
  ]);
  const parsed = parseJsonObject(content ?? "");
  console.log(
    `${client.model}: ${Date.now() - started} ms, JSON ${parsed ? "ok" : "FAILED"}`,
    (content ?? "no reply").slice(0, 200),
  );
  if (!parsed) process.exitCode = 1;
}

main();
