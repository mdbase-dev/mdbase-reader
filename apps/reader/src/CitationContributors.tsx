import { citationNames, type CslName } from "./citation-form-model.js";

import type { JSX } from "react";

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
          <select
            aria-label={`${label} ${String(index + 1)} kind`}
            value={name.literal === undefined ? "person" : "organisation"}
            onChange={(event) =>
              update(
                index,
                event.target.value === "person" ? { given: "", family: "" } : { literal: "" },
              )
            }
          >
            <option value="person">Person</option>
            <option value="organisation">Organisation</option>
          </select>
          {name.literal === undefined ? (
            <>
              <input
                aria-label={`${label} ${String(index + 1)} given name`}
                placeholder="Given names"
                value={name.given ?? ""}
                onChange={(event) => update(index, { ...name, given: event.target.value })}
              />
              <input
                aria-label={`${label} ${String(index + 1)} family name`}
                placeholder="Family name"
                value={name.family ?? ""}
                onChange={(event) => update(index, { ...name, family: event.target.value })}
              />
            </>
          ) : (
            <input
              aria-label={`${label} ${String(index + 1)} organisation`}
              placeholder="Organisation name"
              value={name.literal}
              onChange={(event) => update(index, { literal: event.target.value })}
            />
          )}
          <button
            type="button"
            aria-label={`Remove ${label.toLocaleLowerCase()} ${String(index + 1)}`}
            onClick={() =>
              onChange(
                field,
                names.filter((_, position) => position !== index),
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="citation-add-row"
        onClick={() => onChange(field, [...names, { given: "", family: "" }])}
      >
        Add {label.toLocaleLowerCase()}
      </button>
    </fieldset>
  );
}
