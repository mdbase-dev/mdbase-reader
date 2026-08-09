import type { AsyncResource } from "./use-reader-workspace.js";
import type { SourceId } from "@mdbase-reader/core";

export interface SelectedValue<Value> {
  readonly sourceId: SourceId;
  readonly value: Value;
}

export type SelectedMatch<Value> =
  { readonly matched: true; readonly value: Value } | { readonly matched: false };

export function selectedValue<Value>(
  sourceId: SourceId | null,
  selected: SelectedValue<Value> | null,
): SelectedMatch<Value> {
  return sourceId && selected?.sourceId === sourceId
    ? { matched: true, value: selected.value }
    : { matched: false };
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
