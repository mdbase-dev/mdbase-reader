import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectBodyUpdateRecovery } from "./body-update-recovery.js";
import { mockSdk, testRecord } from "./records.fixtures.js";

import type { RecordView } from "@mdbase-dev/sdk";

const recovered = testRecord({
  path: "sources/crime.md",
  revision: "rev-2",
  types: ["reader-source"],
  frontmatter: { id: "src_01", title: "Crime and Punishment" },
  effective: { id: "src_01", title: "Crime and Punishment" },
  body: "Recovered notes",
}) satisfies RecordView;

describe("ConnectBodyUpdateRecovery", () => {
  it("settles the original SDK mutation and reads back its record", async () => {
    const settle = vi.fn().mockResolvedValue({
      outcome: "confirmed",
      mutationId: "lost",
      receipt: { mutation: "lost", state: "confirmed" },
      record: recovered,
    });
    const client = mockSdk({
      settle,
      ledger: { getSnapshot: () => ({ pending: [{ mutationId: "lost" }] }) },
    });
    const recovery = new ConnectBodyUpdateRecovery(client);
    expect(recovery.pending("lost")).toBe(true);
    expect(
      await recovery.recoverSource({ collectionId: collectionId("c"), requestId: "lost" }),
    ).toMatchObject({ body: "Recovered notes", recordRevision: "rev-2" });
    expect(settle).toHaveBeenCalledWith(
      "lost",
      expect.objectContaining({ read: expect.anything() }),
    );
  });
  it("keeps an unknown mutation identity and never submits another write", async () => {
    const create = vi.fn();
    const update = vi.fn();
    const settle = vi.fn().mockResolvedValue({
      outcome: "unknown",
      mutationId: "lost",
      problem: { code: "outcome_unknown", recovery: "resolve_outcome", message: "Still unknown" },
    });
    const recovery = new ConnectBodyUpdateRecovery(mockSdk({ settle, create, update }));
    await expect(
      recovery.recoverSource({ collectionId: collectionId("c"), requestId: "lost" }),
    ).rejects.toMatchObject({ code: "outcome_unknown", mutationId: "lost" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("does not report a missing mutation as pending", () => {
    const recovery = new ConnectBodyUpdateRecovery(
      mockSdk({ ledger: { getSnapshot: () => ({ pending: [] }) } }),
    );
    expect(recovery.pending("gone")).toBe(false);
  });
});
