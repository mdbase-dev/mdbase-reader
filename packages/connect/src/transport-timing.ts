export interface ReaderTransportTiming {
  readonly transport: "loopback" | "cloud";
  readonly startedMs: number;
  readonly elapsedMs: number;
  readonly responseWaitMs: number | null;
  readonly transferMs: number | null;
}

/** Extract numeric timings only. Cross-origin timing restrictions are preserved, not bypassed. */
export function transportTiming(
  entry: Pick<
    PerformanceResourceTiming,
    | "name"
    | "initiatorType"
    | "startTime"
    | "duration"
    | "requestStart"
    | "responseStart"
    | "responseEnd"
  >,
  origins: readonly string[],
  since: number,
): ReaderTransportTiming | null {
  if (entry.initiatorType !== "fetch" || entry.startTime < since) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(entry.name);
  } catch {
    return null;
  }
  if (!origins.includes(url.origin)) {
    return null;
  }
  const detailed = entry.requestStart > 0 && entry.responseStart >= entry.requestStart;
  return {
    transport:
      url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost"
        ? "loopback"
        : "cloud",
    startedMs: Math.round(entry.startTime - since),
    elapsedMs: Math.round(entry.duration),
    responseWaitMs: detailed ? Math.round(entry.responseStart - entry.requestStart) : null,
    transferMs: detailed ? Math.round(entry.responseEnd - entry.responseStart) : null,
  };
}
