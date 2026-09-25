import type { SourceFieldsController } from "./use-source-fields.js";
import type { SourceFieldDifference } from "@mdbase-reader/core";
import type { JSX } from "react";

/**
 * The library shows the source's own fields, not its citation. Saving a citation never
 * rewrites them (DATA_MODEL §11.3), so offer the copy explicitly when they disagree.
 */
export function CitationSourceSync({
  differences,
  controller,
}: {
  readonly differences: readonly SourceFieldDifference[];
  readonly controller: SourceFieldsController;
}): JSX.Element | null {
  if (!differences.length) {
    return null;
  }
  const labels = differences.map(({ field }) => sourceFieldPhrases[field]);
  return (
    <div className="citation-source-sync" role="status">
      <details>
        <summary>The library shows a different {labels.join(", ")}.</summary>
        <dl>
          {differences.map((difference) => (
            <div key={difference.field}>
              <dt>{sourceFieldLabels[difference.field]}</dt>
              <dd>
                <span>{displaySourceValue(difference.current)}</span>
                <span aria-hidden="true">→</span>
                <span>{displaySourceValue(difference.citation)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <button
        type="button"
        disabled={controller.saving}
        onClick={() =>
          void controller
            .save(Object.fromEntries(differences.map((d) => [d.field, d.citation])))
            // The controller reports the failure beside the details.
            .catch(() => undefined)
        }
      >
        {controller.saving ? "Updating…" : "Update library details"}
      </button>
      {controller.error ? (
        <span className="is-error" role="alert">
          {controller.error}
        </span>
      ) : null}
    </div>
  );
}

const sourceFieldLabels: Record<SourceFieldDifference["field"], string> = {
  title: "Title",
  authors: "Authors",
  published: "Date",
  url: "URL",
};

const sourceFieldPhrases: Record<SourceFieldDifference["field"], string> = {
  title: "title",
  authors: "author list",
  published: "date",
  url: "URL",
};

function displaySourceValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join("; ") || "None";
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "None";
}
