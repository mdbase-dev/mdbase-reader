import { useState } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CitationCard, CitationDetails } from "./CitationCard.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { CslItem, SourceSummary } from "@mdbase-reader/core";

/**
 * The citation: before saving, what was found for the page; after saving, what is stored
 * with the source, ready to copy. Editing stays in Reader, which has the full editor.
 */
export function CitationPanel({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (!c.capture) {
    return null;
  }
  if (!c.source) {
    return (
      <div className="tab-section">
        <CitationCard controller={c} />
        {c.citationPending || c.citation ? null : (
          <p className="hint">
            No citation details were found on this page. Save the source, then add them in Reader.
          </p>
        )}
      </div>
    );
  }
  return <SavedCitation source={c.source} />;
}

function SavedCitation({ source }: { readonly source: SourceSummary }): React.JSX.Element {
  const citation = source.citation;
  const edit = (
    <a className="text-button" href={readerSourceUrl(source)} target="_blank" rel="noreferrer">
      {citation ? "Edit in Reader" : "Add a citation in Reader"}
    </a>
  );
  if (!citation) {
    return (
      <div className="tab-section">
        <p className="hint">This source has no citation yet.</p>
        {edit}
      </div>
    );
  }
  return (
    <div className="tab-section">
      <section className="citation" aria-label="Stored citation">
        <CitationDetails
          citation={{ ...citation, title: text(citation["title"]) ?? source.title }}
          doi={text(citation["DOI"])}
          citekey={citation.id}
        />
      </section>
      <div className="item-actions">
        <CopyButton label="Copy citekey" value={`@${citation.id}`} />
        <CopyButton label="Copy CSL-JSON" value={JSON.stringify(citation, null, 2)} />
      </div>
      {edit}
    </div>
  );
}

function CopyButton({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="secondary compact"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(
          () => setState("copied"),
          () => setState("failed"),
        )
      }
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </button>
  );
}

function text(value: CslItem[string]): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
