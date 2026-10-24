import type { AnnotationOwnerControl } from "./use-annotation-owner.js";
import type { JSX } from "react";

/** Native select keeps ownership keyboard-operable and announced before Save. */
export function AnnotationOwnerChooser({
  control,
  compact = false,
}: {
  readonly control?: AnnotationOwnerControl | undefined;
  readonly compact?: boolean;
}): JSX.Element | null {
  if (!control || control.choices.length <= 1) {
    return null;
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
