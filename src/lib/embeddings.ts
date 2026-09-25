import path from "node:path";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";
export const EMBEDDING_DIMENSIONS = 384;

// Kept across hot reloads so dev mode doesn't reload the model on every edit.
const globalForEmbeddings = globalThis as unknown as {
  extractor?: Promise<FeatureExtractionPipeline>;
};

function getExtractor(): Promise<FeatureExtractionPipeline> {
  globalForEmbeddings.extractor ??= (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = path.join(process.cwd(), ".cache", "models");
    return pipeline("feature-extraction", EMBEDDING_MODEL);
  })().catch((err: unknown) => {
    globalForEmbeddings.extractor = undefined;
    throw err;
  });
  return globalForEmbeddings.extractor;
}

/** Returns a unit-length 384-dimensional embedding, so dot product equals cosine similarity. */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** pgvector text literal, e.g. `[0.1,0.2]`. */
export const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

export function opportunityEmbeddingText(opportunity: {
  title: string;
  type: string;
  skills: string[];
  description: string;
}): string {
  return [
    opportunity.title,
    opportunity.type,
    opportunity.skills.join(", "),
    opportunity.description,
  ].join("\n");
}
