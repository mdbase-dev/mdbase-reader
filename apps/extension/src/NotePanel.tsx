import { useEffect, useState, useSyncExternalStore } from "react";

import { problemMessage, readerSourceUrl } from "./capture-model.js";
import { splitTags } from "./tag-suggestions.js";
import { TagInput } from "./TagInput.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { SourceNoteSession, SourceNoteSnapshot } from "./source-note-session.js";
import type { SourceSummary } from "@mdbase-reader/core";

/**
 * Before saving: the title, tags and note the new source is created with. After saving:
 * the saved source's title, tags and literature note, edited in place.
 */
export function NotePanel({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (!c.capture) {
    return null;
  }
  return c.source ? (
    <SavedSourceNote controller={c} source={c.source} />
  ) : (
    <NewSourceFields controller={c} />
  );
}

function NewSourceFields({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element {
  const update = (field: "title" | "tags" | "note", value: string): void =>
    c.setDraft((draft) => ({ ...draft, [field]: value }));
  return (
    <fieldset
      className="tab-section"
      data-capture-draft
      disabled={c.status === "saving" || c.navigated}
    >
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
        className="note-text"
        value={c.draft.note}
        rows={8}
        onChange={(event) => update("note", event.target.value)}
      />
      <p className="hint">Saved with the source. Keep writing here after saving, or in Reader.</p>
    </fieldset>
  );
}

function SavedSourceNote({
  controller: c,
  source,
}: {
  readonly controller: ExtensionCaptureController;
  readonly source: SourceSummary;
}): React.JSX.Element {
  const { status, load, session, problem } = c.note;
  useEffect(() => {
    if (status === "idle") {
      load();
    }
  }, [load, status]);
  return (
    <div className="tab-section">
      <SourceDetailsForm key={source.id} controller={c} source={source} />
      {session ? (
        <SourceNoteEditor session={session} />
      ) : status === "failed" ? (
        <div className="problem" role="alert">
          <strong>Could not open the literature note.</strong>
          <p>{problem}</p>
          <div className="problem-actions">
            <button type="button" onClick={load}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <p className="hint">Opening the literature note…</p>
      )}
      <a className="text-button" href={readerSourceUrl(source)} target="_blank" rel="noreferrer">
        Edit in Reader
      </a>
    </div>
  );
}

/** Title and tags, saved together when asked; unlike the note, they do not autosave. */
function SourceDetailsForm({
  controller: c,
  source,
}: {
  readonly controller: ExtensionCaptureController;
  readonly source: SourceSummary;
}): React.JSX.Element {
  const [title, setTitle] = useState(source.title);
  const [tags, setTags] = useState(source.tags.join(", "));
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Follow the saved values while nothing is being edited here.
  const [seen, setSeen] = useState(source);
  const changed = title.trim() !== source.title || !sameTags(splitTags(tags), source.tags);
  if (seen !== source) {
    setSeen(source);
    if (!changed) {
      setTitle(source.title);
      setTags(source.tags.join(", "));
    }
  }
  const save = (): void => {
    setWorking(true);
    setProblem(null);
    c.note
      .saveDetails({ title: title.trim(), tags: splitTags(tags) })
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(() => setWorking(false));
  };
  return (
    <form
      className="details-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label htmlFor="saved-title">Title</label>
      <input
        id="saved-title"
        value={title}
        maxLength={300}
        required
        disabled={working}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="saved-tags">
        Tags <span>(comma-separated)</span>
      </label>
      <TagInput
        id="saved-tags"
        value={tags}
        known={c.knownTags}
        onFocus={c.loadTags}
        onChange={setTags}
      />
      {changed ? (
        <div className="item-actions">
          <button type="submit" className="secondary" disabled={working || !title.trim()}>
            {working ? "Saving…" : "Save title and tags"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={working}
            onClick={() => {
              setTitle(source.title);
              setTags(source.tags.join(", "));
              setProblem(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {problem ? (
        <p className="item-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function SourceNoteEditor({ session }: { readonly session: SourceNoteSession }): React.JSX.Element {
  const note = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const conflict = note.state === "conflict";
  return (
    <div className="saved-note">
      <div className="note-heading">
        <label htmlFor="saved-note">Literature note</label>
        <span className={`note-state is-${note.state}`} role="status" aria-live="polite">
          {noteStateLabel(note.state)}
        </span>
      </div>
      <textarea
        id="saved-note"
        className="note-text"
        value={note.body}
        rows={10}
        readOnly={conflict}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        onChange={(event) => session.edit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            session.save();
          }
        }}
      />
      {conflict ? (
        <div className="problem" role="alert">
          <strong>This note changed elsewhere while you were writing.</strong>
          <p>Keep mine to replace it with your text, or use theirs to discard your text.</p>
          <div className="problem-actions">
            <button type="button" onClick={() => session.resolve("mine")}>
              Keep mine
            </button>
            <button type="button" onClick={() => session.resolve("theirs")}>
              Use theirs
            </button>
          </div>
        </div>
      ) : note.state === "error" || note.state === "deleted" ? (
        <div className="problem" role="alert">
          <strong>{note.state === "deleted" ? "Source removed." : "Not saved."}</strong>
          <p>{note.problem ?? "The collection did not accept the note. Your text is kept."}</p>
          {note.state === "error" ? (
            <div className="problem-actions">
              <button type="button" onClick={() => session.save()}>
                Retry save
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {note.restored ? <p className="hint">Restored your unsaved text from earlier.</p> : null}
      {note.localProblem ? (
        <p className="item-problem" role="alert">
          {note.localProblem}
        </p>
      ) : null}
    </div>
  );
}

function noteStateLabel(state: SourceNoteSnapshot["state"]): string {
  switch (state) {
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "recovery":
      return "Checking the last save…";
    case "conflict":
      return "Changed elsewhere";
    case "error":
      return "Not saved";
    case "deleted":
      return "Source removed";
  }
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}
