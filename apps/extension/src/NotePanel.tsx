import { t, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
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
  useLocale();
  if (!c.capture) {
    return null;
  }
  return c.source ? (
    <SavedSourceNote controller={c} source={c.source} />
  ) : awaitingConnection(c) ? (
    <ConnectFirst
      controller={c}
      purpose={translate({ message: "give this page a title, tags and a literature note" })}
    />
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
      <label htmlFor="title">
        <Trans>Title</Trans>
      </label>
      <input
        className="mdbase-field"
        id="title"
        value={c.draft.title}
        maxLength={300}
        required
        onChange={(event) => update("title", event.target.value)}
      />
      <label htmlFor="tags">
        <Trans>
          Tags <span>(comma-separated, optional)</span>
        </Trans>
      </label>
      <TagInput
        id="tags"
        value={c.draft.tags}
        known={c.knownTags}
        onFocus={c.loadTags}
        onChange={(value) => update("tags", value)}
      />
      <label htmlFor="note">
        <Trans>
          Literature note <span>(optional)</span>
        </Trans>
      </label>
      <textarea
        id="note"
        className="mdbase-field note-text"
        value={c.draft.note}
        rows={8}
        onChange={(event) => update("note", event.target.value)}
      />
      <p className="hint">
        <Trans>Saved with the source. Keep writing here after saving, or in Reader.</Trans>
      </p>
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
          <strong>
            <Trans>We couldn’t open the literature note</Trans>
          </strong>
          <p>
            <Trans>Try again in a moment, or edit it in Reader.</Trans>
          </p>
          <div className="problem-actions">
            <button type="button" onClick={load}>
              <Trans context="Reader action">Try again</Trans>
            </button>
          </div>
          <TechnicalDetails detail={problem} />
        </div>
      ) : (
        <p className="hint">
          <Trans>Opening the literature note…</Trans>
        </p>
      )}
      <a className="text-button" href={readerSourceUrl(source)} target="_blank" rel="noreferrer">
        <Trans>Edit in Reader</Trans>
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
  useLocale();
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
      <label htmlFor="saved-note">
        <Trans>Literature note</Trans>
      </label>
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
              ? translate({ message: "This source was removed from your collection" })
              : translate({ message: "Your latest changes aren’t saved yet" })}
          </strong>
          <p>
            {note.state === "deleted"
              ? translate({ message: "Your text is kept in this panel. Copy it somewhere safe." })
              : translate({ message: "Your text is kept in this panel. Try saving again." })}
          </p>
          {note.state === "error" ? (
            <div className="problem-actions">
              <button type="button" onClick={() => session.save()}>
                <Trans context="Reader interface">Try again</Trans>
              </button>
            </div>
          ) : null}
          {note.state === "error" ? <TechnicalDetails detail={note.problem} /> : null}
        </div>
      ) : null}
      {note.restored ? (
        <p className="hint">
          <Trans>Restored your unsaved changes from earlier.</Trans>
        </p>
      ) : null}
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
  useLocale();
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
      <label htmlFor="saved-title">
        <Trans>Title</Trans>
      </label>
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
        <p
          className="hint"
          id="saved-title-hint"
        >{translate`A source needs a title. Until it has a new one, “${details.title}” is kept.`}</p>
      )}
      <label htmlFor="saved-tags">
        <Trans>Tags </Trans>
        <span>
          <Trans>(comma-separated)</Trans>
        </span>
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
  useLocale();
  const remote = note.remote;
  return (
    <div className="problem conflict" role="alert">
      <strong>
        <Trans>This changed somewhere else while you were editing</Trans>
      </strong>
      <p>
        <Trans>
          Keep yours to save your changes over it, or use theirs and drop your changes. Nothing is
          saved until you choose.
        </Trans>
      </p>
      <div className="problem-actions">
        <button type="button" onClick={() => session.resolve("mine")}>
          <Trans>Keep mine</Trans>
        </button>
        <button type="button" onClick={() => session.resolve("theirs")}>
          <Trans>Use theirs</Trans>
        </button>
      </div>
      {remote ? (
        <details className="technical">
          <summary>
            <Trans>See their version</Trans>
          </summary>
          <dl className="other-version">
            <dt>
              <Trans>Title</Trans>
            </dt>
            <dd>{remote.title}</dd>
            <dt>
              <Trans>Tags</Trans>
            </dt>
            <dd>{remote.tags.length ? remote.tags.join(", ") : translate({ message: "None" })}</dd>
            <dt>
              <Trans>Literature note</Trans>
            </dt>
            <dd>
              <pre>{remote.body || translate({ message: "Empty" })}</pre>
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
      return t({ message: "Saved", context: "Reader save status" });
    case "unsaved":
      return t`Unsaved changes`;
    case "saving":
      return t`Saving…`;
    case "recovery":
      return t`Checking the last save…`;
    case "conflict":
      return t`Changed elsewhere`;
    case "error":
      return t`Not saved`;
    case "deleted":
      return t`Source removed`;
  }
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}
