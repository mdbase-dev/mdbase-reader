import { useId, type JSX } from "react";

import { ChevronDownIcon } from "./icons.js";

import type { AnnotationOwnerControl } from "./use-annotation-owner.js";

const routineReasons = new Set([
  "Saved to this source.",
  "A note about this source as a whole.",
  "Created in this chapter.",
]);

/**
 * Native select keeps ownership keyboard-operable and announced before Save. `compact` is the
 * selection toolbar's chip, shown only when there is more than one source to save to.
 */
export function AnnotationOwnerChooser({
  control,
  compact = false,
}: {
  readonly control?: AnnotationOwnerControl | undefined;
  readonly compact?: boolean;
}): JSX.Element | null {
  if (!control) {
    return null;
  }
  if (compact) {
    return <AnnotationSourceChip control={control} />;
  }
  if (control.choices.length <= 1) {
    // No choice to offer, but a chapter fallback still explains where the annotation goes.
    return routineReasons.has(control.reason) || control.pending ? null : (
      <div className="annotation-owner-control">
        <small role="status">{control.reason}</small>
      </div>
    );
  }
  return (
    <div className="annotation-owner-control">
      <label>
        Save to source{" "}
        <select
          aria-label="Save to source"
          value={control.ownerId}
          disabled={control.pending}
          onChange={(event) => control.choose(event.target.value)}
        >
          {control.choices.map((source) => (
            <option key={source.id} value={source.id}>
              {source.title}
            </option>
          ))}
        </select>
      </label>
      <small role="status">{control.reason}</small>
    </div>
  );
}

/**
 * The selection toolbar's quiet version: "in Chapter 2 ▾" after the actions, and only when there
 * is a choice to make. The select keeps its native keyboard handling and is named Save to source;
 * why that source was proposed is its description.
 */
function AnnotationSourceChip({
  control,
}: {
  readonly control: AnnotationOwnerControl;
}): JSX.Element | null {
  const reason = useId();
  if (control.choices.length <= 1) {
    return null;
  }
  return (
    <label className="annotation-source-chip" title={control.reason}>
      <span aria-hidden="true">in</span>
      <select
        aria-label="Save to source"
        aria-describedby={reason}
        value={control.ownerId}
        disabled={control.pending}
        onChange={(event) => control.choose(event.target.value)}
      >
        {control.choices.map((source) => (
          <option key={source.id} value={source.id}>
            {source.title}
          </option>
        ))}
      </select>
      <ChevronDownIcon />
      <small id={reason} className="sr-only" role="status">
        {control.reason}
      </small>
    </label>
  );
}
