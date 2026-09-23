import { CitationIcon, PlusIcon } from "./icons.js";
import { useDismissableDetails } from "./Menu.js";

import type { annotationWikiCandidate } from "./annotation-wiki-candidates.js";
import type { JSX } from "react";

/** Inserts the source's citation or one of its annotations at the note's cursor. */
export function SourceNoteInsertMenu({
  citekey,
  candidates,
  draft,
  onInsertCitation,
  onInsertAnnotation,
}: {
  readonly citekey: string | undefined;
  readonly candidates: readonly ReturnType<typeof annotationWikiCandidate>[];
  readonly draft: string;
  readonly onInsertCitation: (citekey: string) => void;
  readonly onInsertAnnotation: (path: string) => void;
}): JSX.Element {
  const ref = useDismissableDetails();
  return (
    <details ref={ref} className="annotation-insert-menu">
      <summary aria-label="Insert a citation or annotation" title="Insert at the cursor">
        <PlusIcon /> Insert
      </summary>
      <div>
        <button
          className="insert-citation"
          type="button"
          disabled={!citekey}
          title={citekey ? `Insert [@${citekey}] at the cursor` : "Add citation details first"}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => citekey && onInsertCitation(citekey)}
        >
          <CitationIcon />
          <span>
            <strong>Citation</strong>
            <small>{citekey ? `@${citekey}` : "Add citation details first"}</small>
          </span>
        </button>
        <strong>Annotations</strong>
        {candidates.length === 0 ? (
          <p>Highlights and comments on this source appear here.</p>
        ) : null}
        {candidates.map((candidate) => {
          const embedded = draft.includes(`![[${candidate.path}]]`);
          return (
            <button
              key={candidate.path}
              type="button"
              disabled={embedded}
              title={embedded ? "Already embedded in this note" : "Insert at the cursor"}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onInsertAnnotation(candidate.path)}
            >
              <span>
                {embedded ? "In note" : candidate.kind} · {candidate.detail}
              </span>
              <strong>{candidate.label}</strong>
              {candidate.quote ? <small>{candidate.quote}</small> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
