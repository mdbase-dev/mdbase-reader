import { afterEach, describe, expect, it, vi } from "vitest";

import { mapConcurrent, retryRejectedConnectorBusy } from "./repository-client.js";

import type { ConnectOutcome } from "@mdbase-dev/connect";

function busy(outcome: "rejected" | "unknown" = "rejected"): ConnectOutcome<string> {
  return {
    ok: false,
    problem: {
      problem_version: 1,
      code: "connector_busy",
      category: "availability",
      recovery: "retry",
      message: "The connector is busy.",
      operation_outcome: outcome,
    },
  };
}

describe("Reader Connect admission control", () => {
  afterEach(() => vi.useRealTimers());

  it("retries connector work that was explicitly rejected before execution", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<ConnectOutcome<string>>>()
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(busy())
      .mockResolvedValue({ ok: true, value: "saved", diagnostics: [] });

    const result = retryRejectedConnectorBusy(operation);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ ok: true, value: "saved" });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("never retries a mutation with an unknown outcome", async () => {
    const operation = vi.fn(() => Promise.resolve(busy("unknown")));

    await expect(retryRejectedConnectorBusy(operation)).resolves.toEqual(busy("unknown"));
    expect(operation).toHaveBeenCalledOnce();
  });

  it("bounds concurrent work and retains input order", async () => {
    let active = 0;
    let maximum = 0;
    const values = Array.from({ length: 12 }, (_value, index) => index);

    const results = await mapConcurrent(values, 4, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(maximum).toBe(4);
    expect(results).toEqual(values.map((value) => value * 2));
  });
});
