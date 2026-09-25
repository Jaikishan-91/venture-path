import { getLogger } from "./logger";

const pending = new Set<Promise<unknown>>();

/**
 * Run work after the response without awaiting it (emails, AI analysis, skill extraction).
 * Failures are logged, never thrown. Tracked so tests can wait for it (`settleBackground`).
 */
export function runInBackground(label: string, context: object, work: () => Promise<unknown>) {
  const task = Promise.resolve()
    .then(work)
    .catch((err: unknown) => getLogger().error({ ...context, err }, `${label} failed`))
    .finally(() => pending.delete(task));
  pending.add(task);
}

/** Wait until all background work, including work started meanwhile, has finished. */
export async function settleBackground(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
