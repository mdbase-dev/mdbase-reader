import { describe, expect, it } from "vitest";

import { claimDirectAccessCheck, directAccessProblemMessage } from "./use-direct-access.js";

import type { ReaderDirectAccessController } from "@mdbase-reader/connect";

type DirectAccessOutcome = Awaited<ReturnType<ReaderDirectAccessController["request"]>>;

const controller = {} as ReaderDirectAccessController;

describe("direct access probing", () => {
  it("claims an unavailable connector only once", () => {
    const checked = new WeakSet<ReaderDirectAccessController>();
    const snapshot = { authority: "connector", route: "relay", status: "unavailable" } as const;

    expect(claimDirectAccessCheck(checked, controller, snapshot)).toBe(true);
    expect(claimDirectAccessCheck(checked, controller, snapshot)).toBe(false);
  });

  it("does not claim states that do not need a probe", () => {
    const checked = new WeakSet<ReaderDirectAccessController>();

    expect(
      claimDirectAccessCheck(checked, controller, {
        authority: "connector",
        route: "relay",
        status: "permission_required",
      }),
    ).toBe(false);
  });
});

describe("direct access feedback", () => {
  it("keeps a successful direct connection quiet", () => {
    const outcome = { ok: true, value: "available", diagnostics: [] } as DirectAccessOutcome;

    expect(directAccessProblemMessage(outcome)).toBeNull();
  });

  it("explains when the local connector could not be reached", () => {
    const outcome = { ok: true, value: "unavailable", diagnostics: [] } as DirectAccessOutcome;

    expect(directAccessProblemMessage(outcome)).toContain(
      "could not reach the local mdbase connector",
    );
  });

  it("preserves the SDK message for a failed request", () => {
    const outcome = {
      ok: false,
      problem: { code: "timeout", message: "The local connection timed out." },
    } as DirectAccessOutcome;

    expect(directAccessProblemMessage(outcome)).toBe("The local connection timed out.");
  });
});
