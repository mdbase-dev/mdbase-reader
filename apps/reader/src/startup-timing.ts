export type ReaderStartupStage =
  "connection" | "first-page" | "library-index" | "source" | "document-surface";

/** Browser-local User Timing only: never names a collection, source or payload. */
export function startReaderStartupTiming(
  stage: ReaderStartupStage,
): (outcome?: "ready" | "failed" | "cancelled") => void {
  const clock = globalThis.performance;
  const start = clock.now();
  let finished = false;
  return (outcome = "ready") => {
    if (finished) {
      return;
    }
    finished = true;
    try {
      const name = `reader:startup:${stage}:${outcome}`;
      clock.clearMeasures(name);
      clock.measure(name, { start, end: clock.now() });
    } catch {
      // Optional diagnostics must never change loading or authorization results.
    }
  };
}
