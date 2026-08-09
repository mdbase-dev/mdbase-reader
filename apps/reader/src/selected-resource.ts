import type { AsyncResource } from "./use-reader-workspace.js";
import type { SourceId } from "@mdbase-reader/core";

export interface SelectedValue<Value> {
  readonly sourceId: SourceId;
  readonly value: Value;
}

export function selectedResource<Value>(
  sourceId: SourceId | null,
  selected: SelectedValue<AsyncResource<Value>> | null,
): AsyncResource<Value> {
  if (!sourceId) {
    return { status: "idle" };
  }
  return selected?.sourceId === sourceId ? selected.value : { status: "loading" };
}
