-- pgvector (needs the pgvector/pgvector Postgres image, see docker-compose.yml)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "opportunity" ADD COLUMN     "embedding" vector(384);

-- Approximate nearest-neighbour index for cosine distance (`<=>`)
CREATE INDEX "opportunity_embedding_idx" ON "opportunity" USING hnsw ("embedding" vector_cosine_ops);
