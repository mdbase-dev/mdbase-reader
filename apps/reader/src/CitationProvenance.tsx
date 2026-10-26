import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { cslFieldStatuses, type CslProvenance } from "@mdbase-reader/core";

import { cslFieldLabel, displayCslValue } from "./citation-form-model.js";
import { citationEvidenceLabel, citationStatusLabel } from "./citation-provenance.js";
import { citationEvidenceSummary } from "./citation-tab-model.js";
import { ChevronRightIcon } from "./icons.js";
import { useSessionDisclosure } from "./use-session-choice.js";

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
  useLocale();
  // The citekey is chosen in the collection, never sourced.
  const disclosure = useSessionDisclosure("citation.evidence");
  const statuses = Object.entries(cslFieldStatuses(citation, provenance)).filter(
    ([field]) => field !== "id",
  );
  return (
    <details className="citation-provenance citation-disclosure" {...disclosure}>
      <summary>
        <ChevronRightIcon />
        <span>
          <Trans>Field evidence</Trans>
        </span>
        <small>{citationEvidenceSummary(citation, provenance)}</small>
      </summary>
      <dl>
        {statuses.map(([field, status]) => (
          <div key={field}>
            <dt>{cslFieldLabel(field)}</dt>
            <dd>
              <span>{citationStatusLabel(status)}</span>
              {status.kind === "explained" &&
              (status.provenance.agreed?.length || status.provenance.rejected?.length) ? (
                <details>
                  <summary
                    aria-label={translate`Evidence and alternatives for ${cslFieldLabel(field)}`}
                  >
                    <Trans>Evidence and alternatives</Trans>
                  </summary>
                  {status.provenance.agreed?.length ? (
                    <p>
                      <Trans>Also supported by</Trans>{" "}
                      {status.provenance.agreed.map(citationEvidenceLabel).join("; ")}.
                    </p>
                  ) : null}
                  {status.provenance.rejected?.map((alternative, index) => (
                    <div className="citation-alternative" key={index}>
                      <span>{displayCslValue(alternative.value)}</span>
                      <small>{citationEvidenceLabel(alternative.from)}</small>
                      <button
                        type="button"
                        aria-label={translate`Use this value for ${cslFieldLabel(field)}: ${displayCslValue(alternative.value)}`}
                        onClick={() => onChange({ ...citation, [field]: alternative.value })}
                      >
                        <Trans>Use this value</Trans>
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
