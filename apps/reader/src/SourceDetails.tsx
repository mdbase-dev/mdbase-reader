import { sourceCitationDifferences, type Source } from "@mdbase-reader/core";
import { useId, useState, type JSX } from "react";

import type { SourceFieldsController } from "./use-source-fields.js";

type DetailField = "title" | "authors" | "published" | "url" | "description";

const fields: readonly {
  readonly key: DetailField;
  readonly label: string;
  readonly multiline?: boolean;
  readonly placeholder?: string;
}[] = [
  { key: "title", label: "Title" },
  { key: "authors", label: "Authors", multiline: true, placeholder: "One per line" },
  { key: "published", label: "Published", placeholder: "2002, 2002-03 or 2002-03-01" },
  { key: "url", label: "URL", placeholder: "https://" },
  { key: "description", label: "Description", multiline: true },
];

/**
 * The source record's friendly frontmatter, shown above its note the way the file stores it.
 * These fields drive the library; the citation keeps its own copy (DATA_MODEL §11.3).
 */
export function SourceDetails({
  source,
  controller,
  onOpenCitation,
}: {
  readonly source: Source;
  readonly controller: SourceFieldsController;
  readonly onOpenCitation?: () => void;
}): JSX.Element {
  const differs =
    source.citation !== undefined &&
    sourceCitationDifferences(source.frontmatter, source.citation).length > 0;
  return (
    <details className="source-details">
      <summary>
        <strong>Details</strong>
        <span>{detailSummary(source)}</span>
      </summary>
      <div className="source-details-fields">
        {fields.map((field) => (
          <DetailInput
            // Remount when the stored value changes, e.g. after a save elsewhere.
            key={`${source.id}:${field.key}:${JSON.stringify(source.frontmatter[field.key])}`}
            field={field}
            value={source.frontmatter[field.key]}
            disabled={!controller.available}
            onSave={(value) => controller.save({ [field.key]: value })}
          />
        ))}
        {controller.error ? (
          <p className="source-details-note is-error" role="alert">
            {controller.error}
          </p>
        ) : !controller.available ? (
          <p className="source-details-note">This collection cannot edit source details.</p>
        ) : differs ? (
          <p className="source-details-note">
            The citation has different details.{" "}
            {onOpenCitation ? (
              <button type="button" onClick={onOpenCitation}>
                Review citation
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function DetailInput({
  field,
  value,
  disabled,
  onSave,
}: {
  readonly field: (typeof fields)[number];
  readonly value: unknown;
  readonly disabled: boolean;
  readonly onSave: (value: unknown) => Promise<void>;
}): JSX.Element {
  const id = useId();
  const initial = textFor(field.key, value);
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const required = field.key === "title";
  const commit = (): void => {
    if (saving || text === initial) {
      return;
    }
    if (required && !text.trim()) {
      setText(initial);
      return;
    }
    setSaving(true);
    onSave(valueFor(field.key, text, value))
      // The controller reports failures; keep the text so nothing typed is lost.
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };
  const common = {
    id,
    value: text,
    disabled: disabled || saving,
    placeholder: field.placeholder,
    onChange: (event: { readonly target: { readonly value: string } }) =>
      setText(event.target.value),
    onBlur: commit,
  };
  return (
    <div className="source-details-field">
      <label htmlFor={id}>{field.label}</label>
      {field.multiline ? (
        <textarea
          {...common}
          rows={field.key === "authors" ? Math.max(1, text.split("\n").length) : 3}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setText(initial);
            }
          }}
        />
      ) : (
        <input
          {...common}
          type={field.key === "url" ? "url" : "text"}
          required={required}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setText(initial);
            }
          }}
        />
      )}
    </div>
  );
}

function detailSummary(source: Source): string {
  const year = /\d{4}/u.exec(String(source.published ?? ""))?.[0];
  return [source.creators.join(", "), year].filter(Boolean).join(" · ") || source.title;
}

function textFor(key: DetailField, value: unknown): string {
  if (key === "authors") {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").join("\n") : "";
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Authors are one per line; a bare year stays a number, as capture writes it; empty removes. */
function valueFor(key: DetailField, text: string, previous: unknown): unknown {
  if (key === "authors") {
    const authors = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return authors.length ? authors : null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (key === "published" && /^\d{4}$/u.test(trimmed) && typeof previous !== "string") {
    return Number(trimmed);
  }
  return trimmed;
}
