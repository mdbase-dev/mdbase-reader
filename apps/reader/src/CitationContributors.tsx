import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select, type SelectItems } from "@mdbase-dev/ui/select";

import { citationNames, type CslName } from "./citation-form-model.js";

import type { JSX } from "react";

// Name rows intentionally keep the official CSL name surface together for auditability.

export function CitationContributors({
  citation,
  field,
  label,
  onChange,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly field: string;
  readonly label: string;
  readonly onChange: (field: string, value: unknown) => void;
}): JSX.Element {
  const { t } = useLingui();
  const names = citationNames(citation, field);
  const itemLabel =
    field === "author"
      ? t`Author`
      : field === "editor"
        ? t`Editor`
        : field === "translator"
          ? t`Translator`
          : t`Contributor`;
  const update = (index: number, name: CslName): void => {
    onChange(
      field,
      names.map((current, position) => (position === index ? name : current)),
    );
  };
  return (
    <fieldset className="citation-contributors">
      <legend>{label}</legend>
      {names.map((name, index) => (
        <div className="citation-contributor" key={`${field}-${String(index)}`}>
          <header>
            <span>
              {itemLabel} {String(index + 1)}
            </span>
            <Select
              aria-label={t`${itemLabel} ${String(index + 1)} kind`}
              value={name.literal === undefined ? "person" : "organisation"}
              options={contributorKindOptions()}
              onChange={(kind) =>
                update(index, kind === "person" ? { given: "", family: "" } : { literal: "" })
              }
            />
            <button
              type="button"
              aria-label={t`Remove ${itemLabel} ${String(index + 1)}`}
              onClick={() =>
                onChange(
                  field,
                  names.filter((_, position) => position !== index),
                )
              }
            >
              <Trans context="CitationContributors interface">Remove</Trans>
            </button>
          </header>
          <div className="citation-contributor-fields">
            {name.literal === undefined ? (
              <>
                <input
                  className="mdbase-field"
                  aria-label={t`${itemLabel} ${String(index + 1)} given name`}
                  placeholder={t({
                    message: "Given names",
                    context: "CitationContributors interface",
                  })}
                  value={name.given ?? ""}
                  onChange={(event) => update(index, { ...name, given: event.target.value })}
                />
                <input
                  className="mdbase-field"
                  aria-label={t`${itemLabel} ${String(index + 1)} family name`}
                  placeholder={t({
                    message: "Family name",
                    context: "CitationContributors interface",
                  })}
                  value={name.family ?? ""}
                  onChange={(event) => update(index, { ...name, family: event.target.value })}
                />
              </>
            ) : (
              <input
                className="mdbase-field"
                aria-label={t`${itemLabel} ${String(index + 1)} organisation`}
                placeholder={t({
                  message: "Organisation name",
                  context: "CitationContributors interface",
                })}
                value={name.literal}
                onChange={(event) => update(index, { literal: event.target.value })}
              />
            )}
          </div>
          {name.literal === undefined ? (
            <ContributorNameDetails
              name={name}
              index={index}
              itemLabel={itemLabel}
              onChange={(next) => update(index, next)}
            />
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="citation-add-row"
        onClick={() => onChange(field, [...names, { given: "", family: "" }])}
      >
        <Trans>
          + Add
          {itemLabel}
        </Trans>
      </button>
    </fieldset>
  );
}

function ContributorNameDetails({
  name,
  index,
  itemLabel,
  onChange,
}: {
  readonly name: CslName;
  readonly index: number;
  readonly itemLabel: string;
  readonly onChange: (name: CslName) => void;
}): JSX.Element {
  const { t } = useLingui();
  return (
    <details className="citation-name-details">
      <summary>
        <Trans>More name details</Trans>
      </summary>
      <div>
        <input
          className="mdbase-field"
          aria-label={t`${itemLabel} ${String(index + 1)} suffix`}
          placeholder={t({ message: "Suffix", context: "CitationContributors interface" })}
          value={name.suffix ?? ""}
          onChange={(event) => onChange({ ...name, suffix: event.target.value })}
        />
        <input
          className="mdbase-field"
          aria-label={t`${itemLabel} ${String(index + 1)} dropping particle`}
          placeholder={t({
            message: "Dropping particle",
            context: "CitationContributors interface",
          })}
          value={name["dropping-particle"] ?? ""}
          onChange={(event) => onChange({ ...name, "dropping-particle": event.target.value })}
        />
        <input
          className="mdbase-field"
          aria-label={t`${itemLabel} ${String(index + 1)} non-dropping particle`}
          placeholder={t({
            message: "Non-dropping particle",
            context: "CitationContributors interface",
          })}
          value={name["non-dropping-particle"] ?? ""}
          onChange={(event) => onChange({ ...name, "non-dropping-particle": event.target.value })}
        />
        <label>
          <input
            type="checkbox"
            checked={Boolean(name["comma-suffix"])}
            onChange={(event) => onChange({ ...name, "comma-suffix": event.target.checked })}
          />
          {t({ message: "Comma before suffix" })}
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(name["static-ordering"])}
            onChange={(event) => onChange({ ...name, "static-ordering": event.target.checked })}
          />
          {t({ message: "Keep name order" })}
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(name["parse-names"])}
            onChange={(event) => onChange({ ...name, "parse-names": event.target.checked })}
          />
          {t({ message: "Parse literal name" })}
        </label>
      </div>
    </details>
  );
}

function contributorKindOptions(): SelectItems<"person" | "organisation"> {
  return [
    {
      value: "person",
      label: translate({
        message: "Person",
        context: "CitationContributors contributorKindOptions",
      }),
    },
    {
      value: "organisation",
      label: translate({
        message: "Organisation",
        context: "CitationContributors contributorKindOptions",
      }),
    },
  ];
}
