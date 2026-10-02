import { trackMdbaseMarkProgress } from "@mdbase-dev/ui/mark-activity";

/** How a tracked operation ends on the mark: `finish` plays saved, `fail` plays error. */
export type MarkProgressOutcome = "finish" | "fail" | "cancel";

/**
 * Shows `work`'s known progress on the app mark and always ends it. A result is ended by
 * `outcome` (finished by default); a throw fails it, or cancels it quietly once `signal` is
 * aborted, so a stopped operation never shakes the mark.
 */
export async function withMarkProgress<T>(
  work: (update: (fraction: number) => void) => Promise<T>,
  outcome: (result: T) => MarkProgressOutcome = () => "finish",
  signal?: AbortSignal,
): Promise<T> {
  const progress = trackMdbaseMarkProgress();
  try {
    const result = await work(progress.update);
    progress[outcome(result)]();
    return result;
  } catch (reason) {
    if (signal?.aborted) {
      progress.cancel();
    } else {
      progress.fail();
    }
    throw reason;
  } finally {
    // Already ended above; this only guards against an `outcome` that throws.
    progress.cancel();
  }
}

/** `done` of `total` as a 0 to 1 fraction; nothing is done of nothing. */
export function markFraction(done: number, total: number): number {
  return total > 0 ? done / total : 0;
}
