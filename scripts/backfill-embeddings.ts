import "dotenv/config";
import { getDb } from "../src/lib/db";
import { refreshOpportunityEmbedding } from "../src/lib/search";

async function main() {
  const db = getDb();
  const rows = await db.$queryRaw<
    { id: string }[]
  >`SELECT id FROM opportunity WHERE embedding IS NULL`;
  console.log(`${rows.length} listing(s) without an embedding.`);
  for (const { id } of rows) {
    await refreshOpportunityEmbedding(id);
  }
  console.log("Done.");
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
