import { i18n } from "@lingui/core";
import { t as translate, msg } from "@lingui/core/macro";

import type { MessageDescriptor } from "@lingui/core";
/** Technical failures and what a person should read instead; unknown messages pass through. */
const plainProblems: readonly (readonly [RegExp, MessageDescriptor])[] = [
  [
    /(?:encrypted grant key|remote authority signing key) is unavailable/iu,
    msg({
      message:
        "This browser no longer has the key for this collection’s connection. Reconnect to keep reading.",
    }),
  ],
  [
    /(?:exact application declaration|application declaration bound to this grant)/iu,
    msg({
      message:
        "Reader’s access to this collection has changed. Review the updated access to continue.",
    }),
  ],
  [
    /application declaration is invalid/iu,
    msg({
      message:
        "mdbase Connect did not accept Reader’s app registration, so it cannot open collections here.",
    }),
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed/iu,
    msg({
      message: "Reader could not reach mdbase Connect. Check your connection, then try again.",
    }),
  ],
  [
    /timed? ?out/iu,
    msg({ message: "mdbase Connect took too long to answer. Try again in a moment." }),
  ],
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
  const known = plainProblems.find(([pattern]) => pattern.test(message))?.[1];
  return known ? i18n._(known) : (fallback ?? message);
}

/** The original text behind a plain description, for a Details disclosure; null if none. */
export function connectionProblemDetail(
  message: string | null,
  fallback?: string | null,
): string | null {
  if (!message) {
    return null;
  }
  return plainProblems.some(([pattern]) => pattern.test(message)) ||
    (fallback && fallback !== message)
    ? message
    : null;
}

/** What to say instead of a library load failure that has no plain description. */
export function libraryLoadFallback(): string {
  return translate({
    message: "Reader could not load the sources in this collection. Try again in a moment.",
  });
}
