import { Select, type SelectItems } from "@mdbase-dev/ui/select";

import { citationNames, type CslName } from "./citation-form-model.js";

import type { JSX } from "react";

// Name rows intentionally keep the official CSL name surface together for auditability.
// eslint-disable-next-line max-lines-per-function
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
  const names = citationNames(citation, field);
  const itemLabel = singular(label);
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
              aria-label={`${itemLabel} ${String(index + 1)} kind`}
              value={name.literal === undefined ? "person" : "organisation"}
              options={contributorKindOptions}
              onChange={(kind) =>
                update(index, kind === "person" ? { given: "", family: "" } : { literal: "" })
              }
            />
            <button
              type="button"
              aria-label={`Remove ${itemLabel.toLocaleLowerCase()} ${String(index + 1)}`}
              onClick={() =>
                onChange(
                  field,
                  names.filter((_, position) => position !== index),
                )
              }
            >
              Remove
            </button>
          </header>
          <div className="citation-contributor-fields">
            {name.literal === undefined ? (
              <>
                <input
                  className="mdbase-field"
                  aria-label={`${itemLabel} ${String(index + 1)} given name`}
                  placeholder="Given names"
                  value={name.given ?? ""}
                  onChange={(event) => update(index, { ...name, given: event.target.value })}
                />
                <input
                  className="mdbase-field"
                  aria-label={`${itemLabel} ${String(index + 1)} family name`}
                  placeholder="Family name"
                  value={name.family ?? ""}
                  onChange={(event) => update(index, { ...name, family: event.target.value })}
                />
              </>
            ) : (
              <input
                className="mdbase-field"
                aria-label={`${itemLabel} ${String(index + 1)} organisation`}
                placeholder="Organisation name"
                value={name.literal}
                onChange={(event) => update(index, { literal: event.target.value })}
              />
            )}
          </div>
          {name.literal === undefined ? (
            <details className="citation-name-details">
              <summary>More name details</summary>
              <div>
                <input
                  className="mdbase-field"
                  aria-label={`${itemLabel} ${String(index + 1)} suffix`}
                  placeholder="Suffix"
                  value={name.suffix ?? ""}
                  onChange={(event) => update(index, { ...name, suffix: event.target.value })}
                />
                <input
                  className="mdbase-field"
                  aria-label={`${itemLabel} ${String(index + 1)} dropping particle`}
                  placeholder="Dropping particle"
                  value={name["dropping-particle"] ?? ""}
                  onChange={(event) =>
                    update(index, { ...name, "dropping-particle": event.target.value })
                  }
                />
                <input
                  className="mdbase-field"
                  aria-label={`${itemLabel} ${String(index + 1)} non-dropping particle`}
                  placeholder="Non-dropping particle"
                  value={name["non-dropping-particle"] ?? ""}
                  onChange={(event) =>
                    update(index, { ...name, "non-dropping-particle": event.target.value })
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(name["comma-suffix"])}
                    onChange={(event) =>
                      update(index, { ...name, "comma-suffix": event.target.checked })
                    }
                  />
                  Comma before suffix
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(name["static-ordering"])}
                    onChange={(event) =>
                      update(index, { ...name, "static-ordering": event.target.checked })
                    }
                  />
                  Keep name order
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(name["parse-names"])}
                    onChange={(event) =>
                      update(index, { ...name, "parse-names": event.target.checked })
                    }
                  />
                  Parse literal name
                </label>
              </div>
            </details>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="citation-add-row"
        onClick={() => onChange(field, [...names, { given: "", family: "" }])}
      >
        + Add {itemLabel.toLocaleLowerCase()}
      </button>
    </fieldset>
  );
}

function singular(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

const contributorKindOptions: SelectItems<"person" | "organisation"> = [
  { value: "person", label: "Person" },
  { value: "organisation", label: "Organisation" },
];
