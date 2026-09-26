import { useEffect, useRef } from "react";

import { CitationCard } from "./CitationCard.js";
import { HighlightFields } from "./HighlightFields.js";
import { TagInput } from "./TagInput.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

export function CaptureForm({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const form = useRef<HTMLFormElement>(null);
  const canSubmit = !c.source || c.draft.highlight;
  const ready =
    c.snapshot.status === "ready" && !c.busy && !c.navigated && Boolean(c.draft.title.trim());
  const { save } = c;
  useEffect(() => {
    // Ctrl/⌘+Enter saves from any field, so a highlight never needs the mouse.
    const onKeyDown = (event: KeyboardEvent): void => {
      const inside = event.target instanceof Node && form.current?.contains(event.target);
      if (
        inside &&
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        canSubmit &&
        ready
      ) {
        event.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canSubmit, ready, save]);
  if (!c.capture) {
    return null;
  }
  const update = (field: "title" | "tags" | "note", value: string): void =>
    c.setDraft((draft) => ({ ...draft, [field]: value }));
  return (
    <form
      ref={form}
      className="capture-form"
      onSubmit={(event) => {
        event.preventDefault();
        void c.save();
      }}
    >
      {/* Fields stay editable while Connect starts or awaits approval; only saving locks them. */}
      <fieldset disabled={c.status === "saving" || c.navigated}>
        {!c.source ? (
          <>
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={c.draft.title}
              maxLength={300}
              required
              onChange={(event) => update("title", event.target.value)}
            />
            <label htmlFor="tags">
              Tags <span>(comma-separated, optional)</span>
            </label>
            <TagInput
              id="tags"
              value={c.draft.tags}
              known={c.knownTags}
              onFocus={c.loadTags}
              onChange={(value) => update("tags", value)}
            />
            <label htmlFor="note">
              Literature note <span>(optional)</span>
            </label>
            <textarea
              id="note"
              value={c.draft.note}
              rows={2}
              onChange={(event) => update("note", event.target.value)}
            />
            <CitationCard controller={c} />
          </>
        ) : (
          <p className="saved-summary">
            {c.status === "existing" ? "Already in" : "Saved to"} this collection:{" "}
            <strong>{c.source.title}</strong>. Existing source metadata is kept unchanged.
          </p>
        )}
        <HighlightFields controller={c} ready={ready} />
        {canSubmit ? (
          <>
            <button
              className="primary"
              disabled={!ready}
              type="submit"
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {submitLabel(c)}
            </button>
            <p className="shortcut-hint">
              or press <kbd>{modifierKey()}</kbd>+<kbd>Enter</kbd>
            </p>
          </>
        ) : null}
      </fieldset>
    </form>
  );
}

/** ⌘ on Apple keyboards; the shortcut accepts either key everywhere. */
function modifierKey(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";
}

function submitLabel(c: ExtensionCaptureController): string {
  if (c.busy) {
    return c.status === "saving" || c.progress ? "Saving…" : "Please wait…";
  }
  const document = c.capture?.kind === "pdf" ? "PDF" : "source";
  if (!c.draft.highlight) {
    return `Save ${document}`;
  }
  return c.source ? "Save highlight" : `Save ${document} and highlight`;
}
