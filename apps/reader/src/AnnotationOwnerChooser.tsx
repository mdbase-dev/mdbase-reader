import type { AnnotationOwnerControl } from "./use-annotation-owner.js";
import type { JSX } from "react";

/** Native select keeps ownership keyboard-operable and announced before Save. */
export function AnnotationOwnerChooser({
  control,
}: {
  readonly control?: AnnotationOwnerControl | undefined;
}): JSX.Element | null {
  if (!control) {
    return null;
  }
  return (
    <div className="annotation-owner-control">
      <label>
        Annotation owner{" "}
        <select
          aria-label="Annotation owner"
          value={control.ownerId}
          disabled={control.pending}
          onChange={(event) => control.choose(event.target.value)}
        >
          {control.sources.map((source) => (
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
