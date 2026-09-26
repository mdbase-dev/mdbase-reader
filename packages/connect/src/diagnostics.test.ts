/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/explicit-function-return-type -- Controlled async operations and iterators simulate SDK completion. */
import { expect, it } from "vitest";

import { ReaderDiagnostics } from "./diagnostics.js";
import { transportTiming } from "./transport-timing.js";

import type { ConnectOutcome } from "@mdbase-dev/connect";

it("is opt-in, bounded and does not retain payloads, paths, credentials or errors", async () => {
  let time = 0;
  const diagnostics = new ReaderDiagnostics(() => time++, 2);
  const outcome = { ok: true as const, value: { secret: "private payload" }, diagnostics: [] };
  await diagnostics.measure(
    "read",
    () => "relay",
    async () => outcome,
  );
  expect(diagnostics.snapshot()).toEqual([]);
  diagnostics.setEnabled(true);
  for (let index = 0; index < 3; index++) {
    expect(
      await diagnostics.measure(
        "read",
        () => "relay",
        async () => outcome,
      ),
    ).toBe(outcome);
  }
  const snapshot = diagnostics.snapshot();
  expect(snapshot).toHaveLength(2);
  expect(snapshot[0]).toMatchObject({ sequence: 2, route: "relay", result: "ok" });
  expect(JSON.stringify(diagnostics.report())).not.toContain("private");
  await expect(
    diagnostics.measure(
      "query",
      () => "secret-route",
      async () => {
        throw Error("secret error");
      },
    ),
  ).rejects.toThrow("secret error");
  expect(diagnostics.snapshot().at(-1)).toMatchObject({ route: "unknown", result: "thrown" });
  expect(JSON.stringify(diagnostics.report())).not.toContain("secret");
  diagnostics.setEnabled(false);
  expect(diagnostics.snapshot()).toEqual([]);
});

it("records page failures and closes partially consumed iterators without recording terminal steps", async () => {
  const diagnostics = new ReaderDiagnostics();
  diagnostics.setEnabled(true);
  let closed = false;
  async function* pages() {
    try {
      yield { ok: true as const, value: 1, diagnostics: [] };
      yield { ok: true as const, value: 2, diagnostics: [] };
    } finally {
      closed = true;
    }
  }
  for await (const value of diagnostics.pages(() => "remote", pages())) {
    expect(value.ok).toBe(true);
    break;
  }
  expect(closed).toBe(true);
  expect(diagnostics.snapshot()).toHaveLength(1);
  diagnostics.setEnabled(true);
  for await (const value of diagnostics.pages(() => "remote", pages())) {
    expect(value.ok).toBe(true);
  }
  expect(diagnostics.snapshot()).toHaveLength(2);
});

it("does not resurrect recordings stopped during a request", async () => {
  const diagnostics = new ReaderDiagnostics();
  diagnostics.setEnabled(true);
  await diagnostics.measure(
    "read",
    () => "relay",
    async () => {
      diagnostics.setEnabled(false);
      return { ok: true, value: null, diagnostics: [] };
    },
  );
  expect(diagnostics.snapshot()).toEqual([]);
});

it("distinguishes typed timeouts and cancellations without recording problem messages", async () => {
  const diagnostics = new ReaderDiagnostics();
  diagnostics.setEnabled(true);
  for (const code of ["request_timeout", "request_cancelled"]) {
    const failure = {
      ok: false,
      problem: { code, message: "private server details" },
    } as unknown as ConnectOutcome<null>;
    expect(
      await diagnostics.measure(
        "query",
        () => "relay",
        async () => failure,
      ),
    ).toBe(failure);
  }
  expect(diagnostics.snapshot().map((row) => row.result)).toEqual(["timeout", "cancelled"]);
  expect(JSON.stringify(diagnostics.report())).not.toContain("private");
});

it("extracts only numeric transport timings for explicitly allowed origins", () => {
  const entry = {
    name: "https://connect.example/secret-id?token=secret",
    initiatorType: "fetch",
    startTime: 10,
    duration: 40,
    requestStart: 15,
    responseStart: 45,
    responseEnd: 50,
  };
  const timing = transportTiming(entry, ["https://connect.example"], 5);
  expect(timing).toEqual({
    transport: "cloud",
    startedMs: 5,
    elapsedMs: 40,
    responseWaitMs: 30,
    transferMs: 5,
  });
  expect(transportTiming(entry, [], 5)).toBeNull();
  expect(transportTiming(entry, ["https://connect.example"], 11)).toBeNull();
  expect(
    transportTiming({ ...entry, requestStart: 0, responseStart: 0 }, ["https://connect.example"], 5)
      ?.responseWaitMs,
  ).toBeNull();
});
