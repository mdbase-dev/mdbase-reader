import { citationSummary } from "./capture-citation.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** Shows the citation that will be stored with a new source, and where it came from. */
export function CitationCard({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (c.source) {
    return null;
  }
  if (c.citationPending) {
    return <p className="hint citation">Looking for citation details…</p>;
  }
  const preview = c.citation;
  if (!preview) {
    return null;
  }
  const summary = citationSummary(preview.citation);
  return (
    <section className="citation" aria-label="Citation">
      <span className="eyebrow">CITATION</span>
      <p>
        {summary || "Citation details found."}
        {preview.doi ? (
          <>
            {" "}
            · DOI <code>{preview.doi}</code>
          </>
        ) : null}
      </p>
      <p className="hint">
        {preview.origin === "doi"
          ? "From the DOI registry. Saved with the source; edit it later in Reader."
          : "From the publisher’s page metadata. Saved with the source; edit it later in Reader."}
        {preview.problem ? ` The DOI record was unavailable (${preview.problem}).` : ""}
      </p>
    </section>
  );
}
