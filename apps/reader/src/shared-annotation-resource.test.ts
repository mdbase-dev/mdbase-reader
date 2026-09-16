import {
  annotationId,
  collectionId,
  dateTime,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  SharedAnnotationResource,
  sharedAnnotationResource,
} from "./shared-annotation-resource.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
const source = sourceId("s");
function record(id: string, body = id): Annotation {
  return {
    id: annotationId(id),
    collectionId: collectionId("c"),
    sourceId: source,
    source: "[[s]]",
    path: `${id}.md`,
    body,
    tags: [],
    annotationType: "note",
    createdAt: dateTime("2026-08-01T00:00:00Z"),
    recordRevision: recordRevision(body),
  };
}
describe("shared annotation resources", () => {
  it("shares and deduplicates a source query across every view", async () => {
    const annotations = vi.fn(() => Promise.resolve([record("a")]));
    const gateway = { annotations } as unknown as ReaderWorkspaceGateway;
    const one = sharedAnnotationResource(gateway, source);
    expect(sharedAnnotationResource(gateway, source)).toBe(one);
    one.load();
    one.load();
    await Promise.resolve();
    expect(annotations).toHaveBeenCalledOnce();
    expect(one.getSnapshot()?.value.status).toBe("ready");
  });
  it("merges initial results without losing new edits or resurrecting deleted records", async () => {
    let finish!: (records: readonly Annotation[]) => void;
    const gateway = {
      annotations: () =>
        new Promise<readonly Annotation[]>((resolve) => {
          finish = resolve;
        }),
    } as unknown as ReaderWorkspaceGateway;
    const resource = new SharedAnnotationResource(gateway, source);
    resource.load();
    resource.set({
      sourceId: source,
      value: { status: "ready", value: [record("a"), record("b")] },
    });
    resource.set({
      sourceId: source,
      value: { status: "ready", value: [record("a", "Updated"), record("new")] },
    });
    finish([record("a"), record("b"), record("unseen")]);
    await Promise.resolve();
    expect(resource.getSnapshot()).toEqual({
      sourceId: source,
      value: { status: "ready", value: [record("a", "Updated"), record("unseen"), record("new")] },
    });
  });
  it("can retry a failed query when another view mounts", async () => {
    const annotations = vi.fn(() => Promise.resolve([record("a")]));
    annotations.mockRejectedValueOnce(new Error("Offline"));
    const resource = new SharedAnnotationResource(
      { annotations } as unknown as ReaderWorkspaceGateway,
      source,
    );
    resource.load();
    await Promise.resolve();
    await Promise.resolve();
    expect(resource.getSnapshot()?.value.status).toBe("error");
    resource.load();
    await Promise.resolve();
    expect(resource.getSnapshot()?.value.status).toBe("ready");
  });
});
