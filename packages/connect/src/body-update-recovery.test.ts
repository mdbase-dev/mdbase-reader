import { collectionId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ConnectBodyUpdateRecovery } from "./body-update-recovery.js";
import { ConnectRepositoryError } from "./repository-client.js";

import type { ConnectOutcome, RecordDocument } from "@mdbase-dev/connect";

const recovered = {
  path: "sources/crime.md",
  revision: "rev-2",
  types: ["reader-source"],
  frontmatter: { id: "src_01", title: "Crime and Punishment" },
  effectiveFrontmatter: { id: "src_01", title: "Crime and Punishment" },
  body: "Recovered notes",
  file: {},
} satisfies RecordDocument;

function connection(outcome: ConnectOutcome<RecordDocument>): {
  readonly recovery: ConnectBodyUpdateRecovery;
  readonly recover: ReturnType<typeof vi.fn>;
} {
  const recover = vi.fn(() => Promise.resolve(outcome));
  const pendingMutation = vi.fn((requestId: string) =>
    requestId === "lost" ? { requestId, operation: "update", recover } : null,
  );
  return {
    recovery: new ConnectBodyUpdateRecovery({ pendingMutation } as never),
    recover,
  };
}

describe("ConnectBodyUpdateRecovery", () => {
  it("continues the interrupted write through its durable handle", async () => {
    const { recovery, recover } = connection({ ok: true, value: recovered, diagnostics: [] });
    expect(recovery.pending("lost")).toBe(true);
    const source = await recovery.recoverSource({
      collectionId: collectionId("c"),
      requestId: "lost",
    });
    expect(source).toMatchObject({ body: "Recovered notes", recordRevision: "rev-2" });
    expect(recover).toHaveBeenCalledOnce();
  });

  it("keeps the Connect problem when recovery fails", async () => {
    const problem = {
      code: "operation_outcome_unknown",
      message: "Still unknown",
      category: "conflict",
      recovery: "resolve_outcome",
      operation_outcome: "unknown",
      details: { request_id: "lost" },
    } as const;
    const { recovery } = connection({ ok: false, problem } as never);
    const failure = recovery.recoverAnnotation({
      collectionId: collectionId("c"),
      requestId: "lost",
    });
    await expect(failure).rejects.toBeInstanceOf(ConnectRepositoryError);
    await expect(failure).rejects.toMatchObject({ problem: { code: "operation_outcome_unknown" } });
  });

  it("never writes when the handle is gone", async () => {
    const { recovery } = connection({ ok: true, value: recovered, diagnostics: [] });
    expect(recovery.pending("other")).toBe(false);
    await expect(
      recovery.recoverSource({ collectionId: collectionId("c"), requestId: "other" }),
    ).rejects.toThrow("No new write was attempted");
  });
});
