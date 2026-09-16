import { readerErrorMessage } from "./errors.js";

import type { AnnotationState } from "./use-selected-source-resources.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, AnnotationId, SourceId } from "@mdbase-reader/core";
import type { SetStateAction } from "react";

const resources = new WeakMap<ReaderWorkspaceGateway, Map<SourceId, SharedAnnotationResource>>();
/** One annotation query and mutation snapshot per source, not one per editor pane. */
export class SharedAnnotationResource {
  private snapshot: AnnotationState;
  private listeners = new Set<() => void>();
  private started = false;
  private overlay: Map<AnnotationId, Annotation | null> | null = null;
  constructor(
    private readonly gateway: ReaderWorkspaceGateway,
    private readonly sourceId: SourceId,
  ) {
    this.snapshot = { sourceId, value: { status: "loading" } };
  }
  getSnapshot = (): AnnotationState => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set = (action: SetStateAction<AnnotationState>): void => {
    const next = typeof action === "function" ? action(this.snapshot) : action;
    if (next === this.snapshot || next?.sourceId !== this.sourceId) {
      return;
    }
    if (this.overlay && next.value.status === "ready") {
      const before = new Map(recordsIn(this.snapshot).map((record) => [record.id, record]));
      const ids = new Set(next.value.value.map(({ id }) => id));
      for (const id of before.keys()) {
        if (!ids.has(id)) {
          this.overlay.set(id, null);
        }
      }
      for (const record of next.value.value) {
        if (before.get(record.id) !== record) {
          this.overlay.set(record.id, record);
        }
      }
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  };
  load = (): void => {
    if (this.started) {
      return;
    }
    this.started = true;
    this.overlay = new Map();
    void this.gateway
      .annotations(this.sourceId)
      .then((value) => {
        const records = new Map(value.map((record) => [record.id, record]));
        for (const [id, record] of this.overlay ?? []) {
          if (record) {
            records.set(id, record);
          } else {
            records.delete(id);
          }
        }
        this.overlay = null;
        this.set({
          sourceId: this.sourceId,
          value: { status: "ready", value: [...records.values()] },
        });
      })
      .catch((reason: unknown) => {
        this.overlay = null;
        this.started = false; // another mounted view can retry a failed query
        if (this.snapshot?.value.status !== "ready") {
          this.set({
            sourceId: this.sourceId,
            value: {
              status: "error",
              message: readerErrorMessage(
                reason,
                "Reader could not load this source's annotations.",
              ),
            },
          });
        }
      });
  };
}
function recordsIn(state: AnnotationState): readonly Annotation[] {
  return state?.value.status === "ready" ? state.value.value : [];
}
export async function refreshSharedAnnotation(
  gateway: ReaderWorkspaceGateway,
  annotation: Annotation,
): Promise<Annotation | null> {
  const latest = await gateway.refreshAnnotation?.(annotation);
  if (latest) {
    sharedAnnotationResource(gateway, annotation.sourceId).set((current) =>
      current?.value.status === "ready"
        ? {
            sourceId: annotation.sourceId,
            value: {
              status: "ready",
              value: current.value.value.map((candidate) =>
                candidate.id === latest.id ? latest : candidate,
              ),
            },
          }
        : current,
    );
  }
  return latest ?? null;
}
export function sharedAnnotationResource(
  gateway: ReaderWorkspaceGateway,
  id: SourceId,
): SharedAnnotationResource {
  let cache = resources.get(gateway);
  if (!cache) {
    cache = new Map();
    resources.set(gateway, cache);
  }
  let resource = cache.get(id);
  if (!resource) {
    resource = new SharedAnnotationResource(gateway, id);
    cache.set(id, resource);
  }
  return resource;
}
