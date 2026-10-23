import { cslFieldStatuses, type CslProvenance } from "@mdbase-reader/core";

import { cslFieldLabel, displayCslValue } from "./citation-form-model.js";
import { citationEvidenceLabel, citationStatusLabel } from "./citation-provenance.js";

import type { JSX } from "react";

export function CitationProvenance({
  citation,
  provenance,
  onChange,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly provenance: CslProvenance;
  readonly onChange: (citation: Readonly<Record<string, unknown>>) => void;
}): JSX.Element {
  const statuses = cslFieldStatuses(citation, provenance);
  return (
    <details className="citation-provenance">
      <summary>Field sources</summary>
      <dl>
        {Object.entries(statuses).map(([field, status]) => (
          <div key={field}>
            <dt>{cslFieldLabel(field)}</dt>
            <dd>
              <span>{citationStatusLabel(status)}</span>
              {status.kind === "explained" &&
              (status.provenance.agreed?.length || status.provenance.rejected?.length) ? (
                <details>
                  <summary aria-label={`Evidence for ${cslFieldLabel(field)}`}>
                    Evidence and alternatives
                  </summary>
                  {status.provenance.agreed?.length ? (
                    <p>
                      Also supported by{" "}
                      {status.provenance.agreed.map(citationEvidenceLabel).join("; ")}.
                    </p>
                  ) : null}
                  {status.provenance.rejected?.map((alternative, index) => (
                    <div className="citation-alternative" key={index}>
                      <span>{displayCslValue(alternative.value)}</span>
                      <small>{citationEvidenceLabel(alternative.from)}</small>
                      <button
                        type="button"
                        aria-label={`Use alternative ${String(index + 1)} for ${cslFieldLabel(field)}`}
                        onClick={() => onChange({ ...citation, [field]: alternative.value })}
                      >
                        Use this value
                      </button>
                    </div>
                  ))}
                </details>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
