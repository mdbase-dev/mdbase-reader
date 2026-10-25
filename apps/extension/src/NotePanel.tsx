import { useEffect, useState, useSyncExternalStore } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { ConnectFirst } from "./ConnectionPanel.js";
import { awaitingConnection } from "./SaveBar.js";
import { splitTags } from "./tag-suggestions.js";
import { TagInput } from "./TagInput.js";
import { TechnicalDetails } from "./TechnicalDetails.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type {
  SourceDetails,
  SourceNoteSession,
  SourceNoteSnapshot,
} from "./source-note-session.js";
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
  ) : awaitingConnection(c) ? (
    <ConnectFirst controller={c} purpose="give this page a title, tags and a literature note" />
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
        className="mdbase-field"
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
        className="mdbase-field note-text"
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
      {session ? (
        <SourceNoteEditor
          key={source.id}
          session={session}
          knownTags={c.knownTags}
          loadTags={c.loadTags}
        />
      ) : status === "failed" ? (
        <div className="problem" role="alert">
          <strong>We couldn’t open the literature note</strong>
          <p>Try again in a moment, or edit it in Reader.</p>
          <div className="problem-actions">
            <button type="button" onClick={load}>
              Try again
            </button>
          </div>
          <TechnicalDetails detail={problem} />
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

/**
 * The saved source's title, tags and literature note, all autosaved through one record
 * session: a change made elsewhere to a field not edited here is taken in quietly, one to
 * a field edited here waits for a decision.
 */
function SourceNoteEditor({
  session,
  knownTags,
  loadTags,
}: {
  readonly session: SourceNoteSession;
  readonly knownTags: ExtensionCaptureController["knownTags"];
  readonly loadTags: ExtensionCaptureController["loadTags"];
}): React.JSX.Element {
  const note = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const conflict = note.state === "conflict";
  return (
    <div className="saved-note">
      <span className={`note-state is-${note.state}`} role="status" aria-live="polite">
        {noteStateLabel(note.state)}
      </span>
      {conflict ? <ConflictBanner note={note} session={session} /> : null}
      <SourceDetailsFields
        details={note.details}
        locked={conflict}
        knownTags={knownTags}
        loadTags={loadTags}
        onChange={(details) => session.editDetails(details)}
      />
      <label htmlFor="saved-note">Literature note</label>
      <textarea
        id="saved-note"
        className="mdbase-field note-text"
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
      {note.state === "error" || note.state === "deleted" ? (
        <div className="problem" role="alert">
          <strong>
            {note.state === "deleted"
              ? "This source was removed from your collection"
              : "Your latest changes aren’t saved yet"}
          </strong>
          <p>
            {note.state === "deleted"
              ? "Your text is kept in this panel. Copy it somewhere safe."
              : "Your text is kept in this panel. Try saving again."}
          </p>
          {note.state === "error" ? (
            <div className="problem-actions">
              <button type="button" onClick={() => session.save()}>
                Try again
              </button>
            </div>
          ) : null}
          {note.state === "error" ? <TechnicalDetails detail={note.problem} /> : null}
        </div>
      ) : null}
      {note.restored ? <p className="hint">Restored your unsaved changes from earlier.</p> : null}
      {note.localProblem ? (
        <p className="item-problem" role="alert">
          {note.localProblem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Title and tags as typed. Typing saves them with the note; the text follows the saved
 * values when they change elsewhere, except a title cleared here, which is not saved.
 */
function SourceDetailsFields({
  details,
  locked,
  knownTags,
  loadTags,
  onChange,
}: {
  readonly details: SourceDetails;
  readonly locked: boolean;
  readonly knownTags: ExtensionCaptureController["knownTags"];
  readonly loadTags: ExtensionCaptureController["loadTags"];
  readonly onChange: (details: Partial<SourceDetails>) => void;
}): React.JSX.Element {
  const [title, setTitle] = useState(details.title);
  const [tags, setTags] = useState(details.tags.join(", "));
  const [seen, setSeen] = useState(details);
  if (seen !== details) {
    setSeen(details);
    if (title.trim() && title !== details.title) {
      setTitle(details.title);
    }
    if (!sameTags(splitTags(tags), details.tags)) {
      setTags(details.tags.join(", "));
    }
  }
  return (
    <>
      <label htmlFor="saved-title">Title</label>
      <input
        className="mdbase-field"
        id="saved-title"
        value={title}
        maxLength={300}
        required
        readOnly={locked}
        aria-describedby={title.trim() ? undefined : "saved-title-hint"}
        onChange={(event) => {
          setTitle(event.target.value);
          onChange({ title: event.target.value });
        }}
      />
      {title.trim() ? null : (
        <p className="hint" id="saved-title-hint">
          A source needs a title. Until it has a new one, “{details.title}” is kept.
        </p>
      )}
      <label htmlFor="saved-tags">
        Tags <span>(comma-separated)</span>
      </label>
      <TagInput
        id="saved-tags"
        value={tags}
        known={knownTags}
        readOnly={locked}
        onFocus={loadTags}
        onChange={(value) => {
          setTags(value);
          onChange({ tags: splitTags(value) });
        }}
      />
    </>
  );
}

/**
 * The record changed elsewhere in a field also edited here. Nothing is saved until the
 * reader keeps one side; the other version is a disclosure away.
 */
function ConflictBanner({
  note,
  session,
}: {
  readonly note: SourceNoteSnapshot;
  readonly session: SourceNoteSession;
}): React.JSX.Element {
  const remote = note.remote;
  return (
    <div className="problem conflict" role="alert">
      <strong>This changed somewhere else while you were editing</strong>
      <p>
        Keep yours to save your changes over it, or use theirs and drop your changes. Nothing is
        saved until you choose.
      </p>
      <div className="problem-actions">
        <button type="button" onClick={() => session.resolve("mine")}>
          Keep mine
        </button>
        <button type="button" onClick={() => session.resolve("theirs")}>
          Use theirs
        </button>
      </div>
      {remote ? (
        <details className="technical">
          <summary>See their version</summary>
          <dl className="other-version">
            <dt>Title</dt>
            <dd>{remote.title}</dd>
            <dt>Tags</dt>
            <dd>{remote.tags.length ? remote.tags.join(", ") : "None"}</dd>
            <dt>Literature note</dt>
            <dd>
              <pre>{remote.body || "Empty"}</pre>
            </dd>
          </dl>
        </details>
      ) : null}
    </div>
  );
}

const unsubscribed = (): (() => void) => () => undefined;

/** Whether the saved note waits on the reader: a conflict, or a save that failed. */
export function useNoteAttention(session: SourceNoteSession | null): boolean {
  const state = useSyncExternalStore(
    session?.subscribe ?? unsubscribed,
    () => session?.getSnapshot().state ?? null,
    () => null,
  );
  return state === "conflict" || state === "error" || state === "deleted";
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
