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
            <th scope="col">Source</th>
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
        recorded source, not a history of changes.
      </p>
    </details>
  );
}

const kindLabels = {
  registry: "Registry",
  "site-adapter": "Site translator",
  page: "Page",
  "generic-remote": "Remote metadata",
  user: "Manual",
  unknown: "Other",
  unexplained: "Unrecorded",
};
