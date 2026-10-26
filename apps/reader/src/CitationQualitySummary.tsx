import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import {
  citationSourceKinds,
  summariseCitationQuality,
  type SourceSummary,
} from "@mdbase-reader/core";
import { useMemo, type JSX } from "react";

export function CitationQualitySummary({
  sources,
  loading,
}: {
  readonly sources: readonly SourceSummary[];
  readonly loading: boolean;
}): JSX.Element {
  useLocale();
  const summary = useMemo(
    () =>
      summariseCitationQuality(
        sources.map((source) => ({
          csl: source.properties?.["csl"] ?? source.citation,
          cslProvenance:
            "cslProvenance" in source
              ? source.cslProvenance
              : source.properties?.["csl-provenance"],
        })),
      ),
    [sources],
  );
  return (
    <details className="citation-quality-summary" data-menu-keep-open>
      <summary>
        <Trans>Citation quality · local only</Trans>
      </summary>
      <p className="menu-note">
        {summary.sources} <Trans>indexed sources</Trans>
        {loading ? translate({ message: " · library still loading" }) : ""}
        <Trans>. Counts are computed on this device; nothing is sent or retained.</Trans>
      </p>
      <table>
        <caption className="sr-only">
          <Trans>Local citation field counts</Trans>
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <Trans>Evidence</Trans>
            </th>
            <th scope="col">
              <Trans>Fields</Trans>
            </th>
            <th scope="col">
              <Trans>Edited</Trans>
            </th>
            <th scope="col">
              <Trans>Removed</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {citationSourceKinds.map((kind) => (
            <tr key={kind}>
              <th scope="row">{kindLabels[kind]}</th>
              <td>{summary.fieldsBySource[kind]}</td>
              <td>{summary.editedBySource[kind]}</td>
              <td>{summary.removedBySource[kind]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="menu-note">{translate`${summary.removedFields} removed fields. Edited counts compare current values with their recorded evidence, not a history of changes. Online lookups include web pages read through an online service.`}</p>
    </details>
  );
}

/**
 * Plain words for each kind of field evidence, matching the Citation tab's labels. Counts are by
 * stored kind only, so remote readings of a page's own tags (which the tab shows as “From the web
 * page”) count under online lookups; the note under the table says so.
 */
const kindLabels = {
  get parent() {
    return translate({ message: "From the book" });
  },
  get registry() {
    return translate({ message: "Identifier registry" });
  },
  get "site-adapter"() {
    return translate({ message: "From the web page" });
  },
  get page() {
    return translate({ message: "Page metadata" });
  },
  get "generic-remote"() {
    return translate({ message: "From an online lookup" });
  },
  get user() {
    return translate({ message: "Edited manually" });
  },
  get unknown() {
    return translate({ message: "Other" });
  },
  get unexplained() {
    return translate({ message: "No recorded source" });
  },
};
