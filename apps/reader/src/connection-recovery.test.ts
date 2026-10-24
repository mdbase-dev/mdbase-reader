import { describe, expect, it } from "vitest";

import {
  connectionProblemDetail,
  connectionScreenProblem,
  connectionStatus,
  describeConnectionProblem,
  libraryLoadFallback,
  requiresAccessReview,
  requiresReconnect,
  sessionProblemFallback,
  unavailableAction,
} from "./connection-recovery.js";

describe("connection recovery", () => {
  it("describes the Connect startup lifecycle", () => {
    expect(connectionStatus({ status: "starting", connections: [] })).toBe(
      "Finding mdbase Connect…",
    );
  });

  it("recognizes a stale grant after an application declaration update", () => {
    expect(
      requiresAccessReview(
        "Application access denied: Collection setup must match the exact application declaration bound to this grant.",
      ),
    ).toBe(true);
    expect(requiresAccessReview("The collection is offline.")).toBe(false);
  });

  it("asks to reconnect when the grant's keys are gone from this browser", () => {
    for (const message of [
      "The remote authority signing key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable or does not match the grant.",
      "The encrypted grant key is unavailable.",
    ]) {
      expect(requiresReconnect(message)).toBe(true);
      expect(describeConnectionProblem(message)).toMatch(/Reconnect to keep reading/u);
    }
    expect(requiresReconnect("The collection is offline.")).toBe(false);
    expect(describeConnectionProblem("The collection is offline.")).toBe(
      "The collection is offline.",
    );
    expect(describeConnectionProblem(null)).toBeNull();
  });

  it("describes technical failures plainly and keeps the original as detail", () => {
    const raw = 'Application declaration is invalid: /homepage must match pattern "^https://"';
    expect(describeConnectionProblem(raw)).toMatch(/did not accept Reader’s app registration/u);
    expect(connectionProblemDetail(raw)).toBe(raw);
    expect(describeConnectionProblem("TypeError: Failed to fetch")).toMatch(/could not reach/u);
    expect(connectionProblemDetail("The collection is offline.")).toBeNull();
    expect(connectionProblemDetail(null)).toBeNull();
  });

  it("replaces unrecognised technical text with a fallback and keeps it as detail", () => {
    const raw = "mdbase Connect could not query sources: query_failed";
    expect(describeConnectionProblem(raw, libraryLoadFallback)).toBe(libraryLoadFallback);
    expect(connectionProblemDetail(raw, libraryLoadFallback)).toBe(raw);
    // A recognised problem keeps its own plain wording.
    expect(describeConnectionProblem("TypeError: Failed to fetch", libraryLoadFallback)).toMatch(
      /could not reach/u,
    );
  });

  it("says the session's start and setup problems plainly", () => {
    const problem = { code: "collection_invalid", message: "assessCollectionSetup: 409" };
    const blocked = {
      status: "blocked",
      problem,
      collectionId: "c1",
      connections: [],
    } as unknown as Parameters<typeof sessionProblemFallback>[0];
    const fallback = sessionProblemFallback(blocked);
    expect(fallback).toMatch(/Open another collection/u);
    expect(describeConnectionProblem(connectionStatus(blocked), fallback)).toBe(fallback);
    expect(connectionProblemDetail(connectionStatus(blocked), fallback)).toBe(problem.message);
    const startFailed = {
      status: "start_failed",
      problem: { code: "discovery_failed", message: "discovery_failed" },
      connections: [],
    } as unknown as Parameters<typeof sessionProblemFallback>[0];
    expect(sessionProblemFallback(startFailed)).toMatch(/Try again/u);
    expect(sessionProblemFallback({ status: "starting", connections: [] })).toBeNull();

    // A failed start is both the status and the step's error: said once, plainly.
    expect(connectionScreenProblem(startFailed, "discovery_failed")).toEqual({
      status: sessionProblemFallback(startFailed),
      error: sessionProblemFallback(startFailed),
      detail: "discovery_failed",
    });
    // A step's own error that Reader does not recognise is left as written.
    const written = "Choose a collection before updating its access.";
    expect(connectionScreenProblem(blocked, written)).toMatchObject({
      status: fallback,
      error: written,
      detail: null,
    });
  });

  it("explains each unavailable reason with the action that resolves it", () => {
    const unavailable = (reason: string): Parameters<typeof connectionStatus>[0] =>
      ({
        status: "unavailable",
        collectionId: "c1",
        reason,
        connections: [],
      }) as unknown as Parameters<typeof connectionStatus>[0];
    const expected = {
      not_authorized: ["authorize", /Authorize it/u],
      authorization_lost: ["reconnect", /Reconnect/u],
      invalid_stored_grant: ["reconnect", /Reconnect/u],
      legacy_scope_reauthorization_required: ["review", /Review the updated access/u],
    } as const;
    for (const [reason, [action, sentence]] of Object.entries(expected)) {
      const status = connectionStatus(unavailable(reason));
      expect(status).toMatch(sentence);
      expect(status).not.toContain(reason.replaceAll("_", " "));
      expect(unavailableAction(reason)).toBe(action);
    }
    const unknown = connectionStatus(unavailable("some_future_reason"));
    expect(unknown).not.toMatch(/some future reason|some_future_reason/u);
    expect(unknown).toMatch(/Reconnect it, or open another collection/u);
    expect(unavailableAction("some_future_reason")).toBe("reconnect");
  });
});
