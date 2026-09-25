import { useEffect, useId, useRef, useState, type CSSProperties, type JSX } from "react";

import { CitationIcon, PlusIcon } from "./icons.js";

import type { annotationWikiCandidate } from "./annotation-wiki-candidates.js";

const menuWidth = 340;
const viewportMargin = 8;

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
  // The menu opens in the top layer so a narrow pane's clipping cannot crop it.
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const [placement, setPlacement] = useState<CSSProperties>({});
  useEffect(() => {
    // Clicks inside a document frame never reach this page, so treat the page losing focus to
    // the frame as a click outside.
    const close = (): void => {
      if (menu.current?.matches(":popover-open")) {
        menu.current.hidePopover();
      }
    };
    globalThis.addEventListener("blur", close);
    return () => globalThis.removeEventListener("blur", close);
  }, []);
  const insert = (action: () => void): void => {
    menu.current?.hidePopover();
    action();
  };
  return (
    <div className="annotation-insert-menu">
      <button
        type="button"
        aria-label="Insert a citation or annotation"
        title="Insert at the cursor"
        popoverTarget={id}
        onClick={(event) => setPlacement(insertMenuPlacement(event.currentTarget))}
      >
        <PlusIcon /> Insert
      </button>
      <div ref={menu} id={id} popover="auto" style={placement}>
        <button
          className="insert-citation"
          type="button"
          disabled={!citekey}
          title={citekey ? `Insert [@${citekey}] at the cursor` : "Add citation details first"}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => citekey && insert(() => onInsertCitation(citekey))}
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
              onClick={() => insert(() => onInsertAnnotation(candidate.path))}
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
    </div>
  );
}

function insertMenuPlacement(trigger: HTMLElement): CSSProperties {
  const bounds = trigger.getBoundingClientRect();
  const width = Math.min(menuWidth, globalThis.innerWidth - viewportMargin * 2);
  const top = bounds.bottom + 6;
  return {
    top,
    left: Math.max(
      viewportMargin,
      Math.min(bounds.right - width, globalThis.innerWidth - width - viewportMargin),
    ),
    width,
    maxHeight: Math.min(440, globalThis.innerHeight - top - viewportMargin),
  };
}
