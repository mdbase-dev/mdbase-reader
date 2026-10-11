import { expect, it } from "vitest";

import { boundedSignal } from "./api.js";

it("keeps a request deadline even when the caller supplies a cancellation signal", async () => {
  const caller = new AbortController();
  const signal = boundedSignal(caller.signal, 5);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(signal.aborted).toBe(true);
  expect(caller.signal.aborted).toBe(false);
});

it("preserves caller cancellation without waiting for the request deadline", () => {
  const caller = new AbortController();
  const signal = boundedSignal(caller.signal, 12_000);
  const reason = new Error("Cancelled");
  caller.abort(reason);
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toBe(reason);
});
