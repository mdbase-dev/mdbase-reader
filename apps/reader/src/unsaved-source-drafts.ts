const unsafe = new Set<object>();

/** A pending writer outlives its views, so unload protection must too. */
export function trackUnstoredSourceChanges(session: object, unstored: boolean): void {
  if (unstored) {
    unsafe.add(session);
  } else {
    unsafe.delete(session);
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (unsafe.size) {
      event.preventDefault();
    }
  });
}
