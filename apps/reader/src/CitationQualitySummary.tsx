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
      <summary>Citation quality · local only</summary>
      <p className="menu-note">
        {summary.sources} indexed sources{loading ? " · library still loading" : ""}. Counts are
        computed on this device; nothing is sent or retained.
      </p>
      <table>
        <caption className="sr-only">Local citation field counts</caption>
        <thead>
          <tr>
            <th scope="col">Evidence</th>
            <th scope="col">Fields</th>
            <th scope="col">Edited</th>
            <th scope="col">Removed</th>
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
      <p className="menu-note">
        {summary.removedFields} removed fields. Edited counts compare current values with their
        recorded evidence, not a history of changes. Online lookups include web pages read through
        an online service.
      </p>
    </details>
  );
}

/**
 * Plain words for each kind of field evidence, matching the Citation tab's labels. Counts are by
 * stored kind only, so remote readings of a page's own tags (which the tab shows as “From the web
 * page”) count under online lookups; the note under the table says so.
 */
const kindLabels = {
  parent: "From the book",
  registry: "Identifier registry",
  "site-adapter": "From the web page",
  page: "Page metadata",
  "generic-remote": "From an online lookup",
  user: "Edited manually",
  unknown: "Other",
  unexplained: "No recorded source",
};
