import type { AnnotationOwnerControl } from "./use-annotation-owner.js";
import type { JSX } from "react";

const routineReasons = new Set([
  "Owned by this source.",
  "A note about this source as a whole.",
  "Created in this chapter.",
]);

/** Native select keeps ownership keyboard-operable and announced before Save. */
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
  if (control.choices.length <= 1) {
    // No choice to offer, but a chapter fallback still explains where the annotation goes.
    return routineReasons.has(control.reason) || control.pending ? null : (
      <div className="annotation-owner-control">
        <small role="status">{control.reason}</small>
      </div>
    );
  }
  return (
    <div className={`annotation-owner-control${compact ? " is-compact" : ""}`}>
      <label>
        {compact ? "Owner" : "Annotation owner"}{" "}
        <select
          aria-label="Annotation owner"
          title={compact ? control.reason : undefined}
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
      <small className={compact ? "sr-only" : undefined} role="status">
        {control.reason}
      </small>
    </div>
  );
}
