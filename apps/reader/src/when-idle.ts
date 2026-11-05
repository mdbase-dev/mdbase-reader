export function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 2_000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 200);
  return () => clearTimeout(handle);
}
