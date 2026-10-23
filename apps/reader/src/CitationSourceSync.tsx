import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

import { displayCslValue } from "./citation-form-model.js";

import type { SourceFieldsController } from "./use-source-fields.js";
import type { SourceFieldDifference } from "@mdbase-reader/core";
import type { JSX } from "react";

/** Citation saves never overwrite the library's fields without this explicit choice. */
export function CitationSourceSync({
  differences,
  controller,
}: {
  readonly differences: readonly SourceFieldDifference[];
  readonly controller: SourceFieldsController;
}): JSX.Element | null {
  const { t, i18n } = useLingui();
  if (!differences.length) {
    return null;
  }
  const labels: Record<SourceFieldDifference["field"], string> = {
    title: t({ message: "Title", context: "source metadata field" }),
    authors: t({ message: "Authors", context: "source metadata field" }),
    published: t({ message: "Date", context: "source metadata field" }),
    url: "URL",
  };
  const fields = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(
    differences.map(({ field }) => labels[field]),
  );
  return (
    <div className="citation-source-sync" role="status">
      <details>
        <summary>
          <Trans>The library has different details: {fields}.</Trans>
        </summary>
        <dl>
          {differences.map((difference) => (
            <div key={difference.field}>
              <dt>{labels[difference.field]}</dt>
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
            // The controller reports failure beside the details.
            .catch(() => undefined)
        }
      >
        {controller.saving ? t`Updating…` : t`Update library details`}
      </button>
      {controller.error ? (
        <span className="is-error" role="alert">
          {controller.error}
        </span>
      ) : null}
    </div>
  );
}

function displaySourceValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join("; ") || translate({ message: "None", context: "empty metadata value" });
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : translate({ message: "None", context: "empty metadata value" });
}

/** Filling gaps edits only the draft. Saving remains the person's choice. */
export function CitationGapFill({
  gaps,
  onApply,
}: {
  readonly gaps: Readonly<Record<string, unknown>>;
  readonly onApply: (gaps: Readonly<Record<string, unknown>>) => void;
}): JSX.Element | null {
  const { t, i18n } = useLingui();
  const fields = Object.keys(gaps);
  if (!fields.length) {
    return null;
  }
  const labels: Readonly<Record<string, string>> = {
    author: t({ message: "Authors", context: "citation metadata field" }),
    issued: t({ message: "Date", context: "citation metadata field" }),
    URL: "URL",
  };
  const missingDetails = new Intl.ListFormat(i18n.locale, { type: "conjunction" }).format(
    fields.map((field) => `${labels[field] ?? field} (${displayGap(gaps[field])})`),
  );
  return (
    <div className="citation-source-sync is-gap" role="status">
      <p>
        <Trans>The citation is missing details recorded in your library: {missingDetails}.</Trans>
      </p>
      <button type="button" onClick={() => onApply(gaps)}>
        <Trans>Add to citation</Trans>
      </button>
    </div>
  );
}

function displayGap(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((name: unknown) => displayCslValue(name)).join("; ");
  }
  return displayCslValue(value);
}
