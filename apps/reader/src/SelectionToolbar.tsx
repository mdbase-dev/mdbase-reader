import { highlightColorKey, highlightColorKeys, type HighlightColorKey } from "@mdbase-reader/core";
import { claimFrameShortcut, type ReaderLocator } from "@mdbase-reader/reading-surface";
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
import { AnnotationSourceLine } from "./AnnotationOwnerActions.js";
import { AnnotationOwnerChooser } from "./AnnotationOwnerChooser.js";
import { useHighlightMeanings, useLastHighlightColor } from "./highlight-colors.js";
import { HighlightSwatches } from "./HighlightSwatches.js";
import { CommentIcon, CopyIcon, QuoteIcon, TrashIcon } from "./icons.js";
import { humanPassageLabel } from "./passage-labels.js";
import { citableLocator, citedQuote, copyText } from "./selection-copy.js";
import { selectionToolbarPlacement } from "./selection-toolbar-placement.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { SelectionToolbarTarget } from "./use-selection-toolbar.js";

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
  // Older annotations stored file links as their locator; those never reach a citation.
  const locator = humanPassageLabel(annotation.locator?.label);
  return { text, ...(locator ? { locator } : {}) };
}

function pageLabel(locator: ReaderLocator): string | undefined {
  return locator.kind === "pdf" ? `p. ${String(locator.pageIndex + 1)}` : undefined;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true']"));
}

const otherControls =
  "button, a[href], summary, [role='button'], [role='link'], [role='menu'], [role='menuitem'], " +
  "[role='menubar'], [role='tab'], [role='option'], [role='listbox'], [role='checkbox'], " +
  "[role='radio'], [role='switch'], [role='slider'], [role='treeitem'], [role='gridcell']";

/** Whether a key went to a control elsewhere in the app, such as a sidebar button. */
function isOnOtherControl(target: EventTarget | null, toolbar: Node | null): boolean {
  const element = target as { closest?: (selector: string) => Node | null } | null;
  const control = element?.closest?.(otherControls);
  return Boolean(control && !toolbar?.contains(control));
}

/**
 * Quick actions beside a fresh selection (a colour to highlight it in, comment, copy) or a
 * clicked highlight (its colour, comment, copy, delete). Nothing is saved until an action is
 * chosen. The source a selection saves to follows the actions as a quiet chip, and only when
 * there is a choice; a highlight names its source only when that is not the open one.
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
  }, [state, composer.ownerControl?.pending, composer.ownerControl?.choices.length]);
  if (!state) {
    return null;
  }
  return (
    <div ref={layer} className={`selection-toolbar-layer${style ? " is-anchored" : " is-docked"}`}>
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
  const lastColor = useLastHighlightColor();
  const meanings = useHighlightMeanings();
  const comment = (): void =>
    target.kind === "selection"
      ? composer.comment(target.selection)
      : composer.edit(target.annotation);
  const swatches = toolbarSwatches(target, composer, lastColor);
  useToolbarKeys(barRef, composer.dismissToolbar, { c: comment, ...colorKeys(swatches) });
  useFrameColorKeys(swatches?.mode === "recolor" && !swatches.disabled);
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
      {swatches ? (
        <>
          <HighlightSwatches
            mode={swatches.mode}
            ringed={swatches.ringed}
            meanings={meanings}
            disabled={swatches.disabled}
            onChoose={swatches.choose}
          />
          <span className="selection-toolbar-divider" aria-hidden="true" />
        </>
      ) : null}
      <button type="button" title="Comment on highlight (C)" onClick={comment}>
        <CommentIcon /> Comment on highlight
      </button>
      <span className="selection-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="icon-button"
        aria-label="Copy"
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
        aria-label={
          copied === "citation" ? "Cite: copied with citation" : "Cite: copy with citation"
        }
        title={
          composer.quoteCitation?.citekey
            ? `Copy as a quote citing @${composer.quoteCitation.citekey}`
            : "Copy as a quote citing the source’s title"
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
      {target.kind === "selection" ? (
        <AnnotationOwnerChooser control={composer.ownerControl} compact />
      ) : (
        // The open source goes without saying; name another, or a passage outside its chapter.
        <AnnotationSourceLine
          annotation={target.annotation}
          sources={composer.ownerControl?.sources}
          showSource={target.annotation.sourceId !== composer.sourceId}
        />
      )}
    </div>
  );
}

interface ToolbarSwatches {
  readonly mode: "highlight" | "recolor";
  readonly ringed: HighlightColorKey | null;
  /** While the owner of a new highlight is being worked out, nothing can be saved yet. */
  readonly disabled: boolean;
  readonly choose: (color: HighlightColorKey) => void;
}

/**
 * A selection's swatches save it in a colour; a highlight's change its colour, when the
 * collection can. Other annotations, such as area captures, have no colour to choose.
 */
function toolbarSwatches(
  target: SelectionToolbarTarget,
  composer: AnnotationComposerController,
  lastColor: HighlightColorKey,
): ToolbarSwatches | null {
  if (target.kind === "selection") {
    return {
      mode: "highlight",
      ringed: lastColor,
      disabled: Boolean(composer.ownerControl?.pending),
      choose: (color) => composer.highlight(target.selection, color),
    };
  }
  const { annotation } = target;
  const recolor = composer.recolor;
  if (!recolor || annotation.annotationType !== "highlight") {
    return null;
  }
  return {
    mode: "recolor",
    ringed: highlightColorKey(annotation.color),
    // A highlight still being saved has no record to change yet.
    disabled: !annotation.path || !annotation.recordRevision,
    choose: (color) => recolor(annotation, color),
  };
}

/**
 * 1–5 choose a colour by its place in the row; for a selection, H highlights in the colour
 * used last. A highlight's colour changes only by number, since H means "highlight".
 */
function colorKeys(swatches: ToolbarSwatches | null): Partial<Record<ToolbarKey, () => void>> {
  if (!swatches || swatches.disabled) {
    return {};
  }
  const { choose, ringed } = swatches;
  return {
    ...Object.fromEntries(
      highlightColorKeys.map((color, index) => [String(index + 1), () => choose(color)]),
    ),
    ...(swatches.mode === "highlight" && ringed ? { h: () => choose(ringed) } : {}),
  };
}

/**
 * A clicked highlight leaves focus in the page, which keeps 1–5 to itself when nothing is
 * selected; ask it to pass them on while the colours are offered.
 */
function useFrameColorKeys(active: boolean): void {
  useEffect(() => (active ? claimFrameShortcut(document, "colors") : undefined), [active]);
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
        <span className="selection-toolbar-label">Delete highlight</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="is-danger"
      // The name starts with the visible words, so speech users can say what they see.
      aria-label={state === "deleting" ? undefined : "Delete highlight"}
      disabled={state === "deleting"}
      onClick={() => {
        onChange("deleting");
        void onDelete().then(
          (embeddedIn) => onChange(embeddedIn.length > 0 ? embeddedIn.length : "idle"),
          () => onChange("idle"),
        );
      }}
    >
      {state === "deleting" ? "Deleting…" : "Delete highlight"}
    </button>
  );
}

type ToolbarKey = "h" | "c" | "1" | "2" | "3" | "4" | "5";
const toolbarKeys: ReadonlySet<string> = new Set<ToolbarKey>(["h", "c", "1", "2", "3", "4", "5"]);

/**
 * Esc and a click outside dismiss the toolbar; H, C and 1–5 act on it. Keys pressed inside a
 * document frame arrive here too: renderers forward them while text is selected. These keys
 * pressed on a control elsewhere, such as a sidebar button, belong to that control.
 */
function useToolbarKeys(
  barRef: RefObject<HTMLDivElement | null>,
  dismiss: () => void,
  actions: Readonly<Partial<Record<ToolbarKey, () => void>>>,
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
        toolbarKeys.has(key) &&
        !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) &&
        !isOnOtherControl(event.target, barRef.current)
      ) {
        const action = latest.current[key as ToolbarKey];
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
