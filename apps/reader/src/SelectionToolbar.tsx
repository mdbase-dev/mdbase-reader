import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type RefObject,
} from "react";

import { annotationBodyContent } from "./annotation-body-content.js";
import { CommentIcon, CopyIcon, HighlightIcon, QuoteIcon, TrashIcon } from "./icons.js";
import { citableLocator, citedQuote, copyText } from "./selection-copy.js";
import { selectionToolbarPlacement } from "./selection-toolbar-placement.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { SelectionToolbarTarget } from "./use-selection-toolbar.js";
import type { ReaderLocator } from "@mdbase-reader/reading-surface";

/** The passage and its human locator, whether it is still a selection or already a highlight. */
function passageOf(target: SelectionToolbarTarget): {
  readonly text: string;
  readonly locator?: string | undefined;
} {
  if (target.kind === "selection") {
    return {
      text: target.selection.value.target.quote.exact,
      locator: pageLabel(target.selection.value.locator),
    };
  }
  const annotation = target.annotation;
  const text =
    annotationBodyContent(annotation.body).quote ?? annotation.target?.quote?.exact ?? "";
  return { text, ...(annotation.locator ? { locator: annotation.locator.label } : {}) };
}

function pageLabel(locator: ReaderLocator): string | undefined {
  return locator.kind === "pdf" ? `p. ${String(locator.pageIndex + 1)}` : undefined;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true']"));
}

/**
 * Quick actions beside a fresh selection (highlight, comment, copy) or a clicked highlight
 * (comment, copy, delete). Nothing is saved until an action is chosen.
 */
export function SelectionToolbarLayer({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  const layer = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const state = composer.toolbar;
  useLayoutEffect(() => {
    const element = layer.current;
    const toolbar = bar.current;
    setStyle(
      element && toolbar && state
        ? selectionToolbarPlacement(element.getBoundingClientRect(), state.rect, {
            width: toolbar.offsetWidth,
            height: toolbar.offsetHeight,
          })
        : null,
    );
  }, [state]);
  if (!state) {
    return null;
  }
  return (
    <div ref={layer} className={`selection-toolbar-layer${style ? " is-anchored" : ""}`}>
      <SelectionToolbar
        key={state.target.kind === "annotation" ? state.target.annotation.id : "selection"}
        barRef={bar}
        target={state.target}
        composer={composer}
        {...(style ? { style } : {})}
      />
    </div>
  );
}

/**
 * On a phone the actions take the place of the source views at the bottom edge, clear of the
 * system's own selection menu and in easy reach of a thumb, while the text stays selected.
 */
export function SelectionActionBar({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  const bar = useRef<HTMLDivElement>(null);
  const state = composer.toolbar;
  if (!state) {
    return null;
  }
  return (
    <div className="mobile-source-views is-selection">
      <SelectionToolbar
        key={state.target.kind === "annotation" ? state.target.annotation.id : "selection"}
        barRef={bar}
        target={state.target}
        composer={composer}
      />
    </div>
  );
}

function SelectionToolbar({
  barRef,
  target,
  composer,
  style,
}: {
  readonly barRef: RefObject<HTMLDivElement | null>;
  readonly target: SelectionToolbarTarget;
  readonly composer: AnnotationComposerController;
  readonly style?: CSSProperties;
}): JSX.Element {
  const [copied, setCopied] = useState<"text" | "citation" | "failed" | null>(null);
  const [deletion, setDeletion] = useState<"idle" | "confirming" | "deleting" | number>("idle");
  const passage = passageOf(target);
  const comment = (): void =>
    target.kind === "selection"
      ? composer.comment(target.selection)
      : composer.edit(target.annotation);
  const highlight = (): void => {
    if (target.kind === "selection") {
      composer.highlight(target.selection);
    }
  };
  useToolbarKeys(barRef, composer.dismissToolbar, {
    c: comment,
    ...(target.kind === "selection" ? { h: highlight } : {}),
  });
  const copy = (kind: "text" | "citation"): void => {
    const citation = composer.quoteCitation;
    const text =
      kind === "citation" && citation
        ? citedQuote(passage.text, { ...citation, locator: citableLocator(passage.locator) })
        : passage.text;
    void copyText(text).then(
      () => setCopied(kind),
      () => setCopied("failed"),
    );
  };
  return (
    <div
      ref={barRef}
      className="selection-toolbar"
      role="toolbar"
      aria-label={target.kind === "selection" ? "Selected text" : "Highlight"}
      style={style}
    >
      {target.kind === "selection" ? (
        <button type="button" title="Highlight (H)" onClick={highlight}>
          <HighlightIcon /> Highlight
        </button>
      ) : null}
      <button type="button" title="Comment (C)" onClick={comment}>
        <CommentIcon /> Comment
      </button>
      <span className="selection-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="icon-button"
        aria-label={copied === "text" ? "Copied" : "Copy"}
        title={copied === "text" ? "Copied" : "Copy text"}
        disabled={!passage.text}
        onClick={() => copy("text")}
      >
        <CopyIcon />
        <span className="selection-toolbar-label">Copy</span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={copied === "citation" ? "Copied with citation" : "Copy with citation"}
        title={
          composer.quoteCitation?.citekey
            ? `Copy as a quote citing @${composer.quoteCitation.citekey}`
            : "Copy as a quote citing the source's title"
        }
        disabled={!passage.text}
        onClick={() => copy("citation")}
      >
        <QuoteIcon />
        <span className="selection-toolbar-label">Cite</span>
      </button>
      {target.kind === "annotation" ? (
        <DeleteHighlightButton
          state={deletion}
          onChange={setDeletion}
          onDelete={() => composer.remove(target.annotation)}
          onReview={() => composer.edit(target.annotation)}
        />
      ) : null}
      {copied ? (
        <span className="selection-toolbar-status" role="status">
          {copied === "failed" ? "Couldn’t copy" : "Copied"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Deleting takes a second click. A highlight that notes embed is not deleted from here: the
 * editor lists the notes whose embeds would break.
 */
function DeleteHighlightButton({
  state,
  onChange,
  onDelete,
  onReview,
}: {
  readonly state: "idle" | "confirming" | "deleting" | number;
  readonly onChange: (state: "idle" | "confirming" | "deleting" | number) => void;
  readonly onDelete: () => Promise<readonly string[]>;
  readonly onReview: () => void;
}): JSX.Element {
  if (typeof state === "number") {
    return (
      <button type="button" className="is-review" onClick={onReview}>
        In {state} {state === 1 ? "note" : "notes"} · Review
      </button>
    );
  }
  if (state === "idle") {
    return (
      <button
        type="button"
        className="icon-button"
        aria-label="Delete highlight"
        title="Delete highlight"
        onClick={() => onChange("confirming")}
      >
        <TrashIcon />
        <span className="selection-toolbar-label">Delete</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="is-danger"
      aria-label="Confirm delete"
      disabled={state === "deleting"}
      onClick={() => {
        onChange("deleting");
        void onDelete().then(
          (embeddedIn) => onChange(embeddedIn.length > 0 ? embeddedIn.length : "idle"),
          () => onChange("idle"),
        );
      }}
    >
      {state === "deleting" ? "Deleting…" : "Delete?"}
    </button>
  );
}

/**
 * Esc and a click outside dismiss the toolbar; H and C act on it. Keys pressed inside a document
 * frame arrive here too: renderers forward them while text is selected.
 */
function useToolbarKeys(
  barRef: RefObject<HTMLDivElement | null>,
  dismiss: () => void,
  actions: Readonly<Partial<Record<"h" | "c", () => void>>>,
): void {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTyping(event.target)) {
        return;
      }
      const key = event.key.toLocaleLowerCase();
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      } else if (
        (key === "h" || key === "c") &&
        !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      ) {
        const action = latest.current[key];
        if (action) {
          event.preventDefault();
          action();
        }
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) {
        dismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [barRef, dismiss]);
}
