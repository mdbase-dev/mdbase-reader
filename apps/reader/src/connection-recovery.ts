/** Technical failures and what a person should read instead; unknown messages pass through. */
const plainProblems: readonly (readonly [RegExp, string])[] = [
  [
    /(?:encrypted grant key|remote authority signing key) is unavailable/iu,
    "This browser no longer has the key for this collection’s connection. Reconnect to keep reading.",
  ],
  [
    /(?:exact application declaration|application declaration bound to this grant)/iu,
    "Reader’s access to this collection has changed. Review the updated access to continue.",
  ],
  [
    /application declaration is invalid/iu,
    "mdbase Connect did not accept Reader’s app registration, so it cannot open collections here.",
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed/iu,
    "Reader could not reach mdbase Connect. Check your connection, then try again.",
  ],
  [/timed? ?out/iu, "mdbase Connect took too long to answer. Try again in a moment."],
];

/**
 * Connection failures as a person should read them. Unknown messages pass through, unless
 * the caller knows the text is technical and gives a `fallback` to say instead.
 */
export function describeConnectionProblem(message: string, fallback?: string | null): string;
export function describeConnectionProblem(
  message: string | null,
  fallback?: string | null,
): string | null;
export function describeConnectionProblem(
  message: string | null,
  fallback?: string | null,
): string | null {
  if (!message) {
    return message;
  }
  return plainProblems.find(([pattern]) => pattern.test(message))?.[1] ?? fallback ?? message;
}

/** The original text behind a plain description, for a Details disclosure; null if none. */
export function connectionProblemDetail(
  message: string | null,
  fallback?: string | null,
): string | null {
  return message && describeConnectionProblem(message, fallback) !== message ? message : null;
}

/** What to say instead of a library load failure that has no plain description. */
export const libraryLoadFallback =
  "Reader could not load the sources in this collection. Try again in a moment.";
