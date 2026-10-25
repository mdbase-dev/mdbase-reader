import {
  cleanHighlightMeaning,
  highlightColorKeys,
  highlightMeaningMaxLength,
  highlightPalette,
  type AppSettingsChanges,
  type HighlightColorKey,
  type HighlightMeanings,
} from "@mdbase-reader/core";
import { useEffect, useId, useState, useSyncExternalStore, type JSX } from "react";

import {
  deviceHighlightMeanings,
  forgetDeviceHighlightMeanings,
  highlightMeaningSuggestions,
} from "./highlight-colors.js";

import type {
  AppSettingsSnapshot,
  ReaderSettingsStore,
  ReaderSettingsValues,
} from "@mdbase-reader/connect";

type Field = "highlight_colors" | "highlight_meanings";

interface Drafts {
  /**
   * The colours offered, in order. The rest are hidden: the record keeps no place for them, so
   * showing one again adds it at the end.
   */
  readonly offered: readonly HighlightColorKey[];
  readonly meanings: Readonly<Record<HighlightColorKey, string>>;
}

interface Message {
  readonly text: string;
  readonly error: boolean;
}

const fieldNames: Readonly<Record<Field, string>> = {
  highlight_colors: "colours offered",
  highlight_meanings: "meanings",
};

function draftsFrom(colors: readonly HighlightColorKey[], meanings: HighlightMeanings): Drafts {
  return {
    offered: colors,
    meanings: Object.fromEntries(
      highlightColorKeys.map((key) => [key, meanings[key] ?? ""]),
    ) as Record<HighlightColorKey, string>,
  };
}

const defaultDrafts = draftsFrom(highlightColorKeys, {});

function hidden(drafts: Drafts): readonly HighlightColorKey[] {
  return highlightColorKeys.filter((key) => !drafts.offered.includes(key));
}

function cleanMeanings(drafts: Drafts): HighlightMeanings {
  return Object.fromEntries(
    highlightColorKeys.flatMap((key) => {
      const meaning = cleanHighlightMeaning(drafts.meanings[key]);
      return meaning ? [[key, meaning]] : [];
    }),
  );
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Which highlight colours the collection offers, in what order, and what each means. Saved to
 * the collection's Reader settings record, so every device and the extension agree. Highlights
 * keep only their colour, so a meaning relabels every highlight of that colour.
 */
export function HighlightColorSettings({
  settings,
  onDirtyChange,
}: {
  readonly settings: ReaderSettingsStore;
  /** Whether there are edits the user made and has not saved, for leaving the page. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}): JSX.Element {
  const id = useId();
  const snapshot = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const editor = useDrafts(snapshot);
  const { pending, dirty, saving, message, save } = useSave(settings, editor);
  const rowActions = useRowActions(id, editor);
  const readOnly = snapshot.settings.readOnly;
  const disabled = Boolean(readOnly) || snapshot.status === "loading" || saving;
  const { drafts } = editor;
  const hiddenColors = hidden(drafts);
  const isDefault =
    same(drafts.offered, highlightColorKeys) && !Object.keys(cleanMeanings(drafts)).length;
  const warnings = snapshot.settings.warnings.filter(
    (warning) => warning.field === "highlight_colors" || warning.field === "highlight_meanings",
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const row = (key: HighlightColorKey, index: number): JSX.Element => (
    <ColorRow
      key={key}
      id={id}
      color={key}
      index={index}
      drafts={drafts}
      disabled={disabled}
      onChange={editor.set}
      actions={rowActions}
    />
  );

  return (
    <form
      className="settings-form highlight-color-settings"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && pending) {
          void save();
        }
      }}
    >
      <h3 id={`${id}-title`}>Highlight colours</h3>
      <p id={`${id}-description`}>
        Which colours Reader offers when you highlight, in this order, and what each means.
      </p>
      <p className="highlight-color-settings-note">
        Changing a colour’s meaning also relabels the highlights already in that colour. Hiding a
        colour only stops Reader offering it: highlights already in it keep their colour.
      </p>
      {readOnly ? (
        <p className="file-name-settings-notice" role="status">
          {readOnly}
        </p>
      ) : null}
      {editor.fromDevice && !readOnly ? (
        <p className="file-name-settings-notice" role="status">
          These meanings were set on this device only. Save to share them with this collection, or
          clear them.
        </p>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning.field} className="file-name-template-warning">
          The saved {fieldNames[warning.field as Field]} cannot be used: {warning.message}
        </p>
      ))}
      <ol className="highlight-color-rows" aria-label="Offered colours, in order">
        {drafts.offered.map(row)}
      </ol>
      {hiddenColors.length > 0 ? (
        <>
          <h4 id={`${id}-hidden`} className="highlight-color-group">
            Hidden
          </h4>
          <ul className="highlight-color-rows" aria-labelledby={`${id}-hidden`}>
            {hiddenColors.map(row)}
          </ul>
        </>
      ) : null}
      <p id={`${id}-one`} className="file-name-template-hint">
        At least one colour stays offered. The colour new highlights use is this device’s own: the
        one used last, or the first offered while that one is hidden.
      </p>
      <p className="sr-only" role="status">
        {rowActions.announcement}
      </p>
      {message ? (
        <p
          className={`file-name-settings-message${message.error ? " is-error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <div className="settings-form-actions">
        <button
          type="button"
          disabled={disabled || (isDefault && warnings.length === 0)}
          onClick={() => editor.reset()}
        >
          Reset to default
        </button>
        <button type="submit" disabled={disabled || !pending}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/**
 * One colour and its meaning. An offered colour can move and be hidden; a hidden one has no
 * place in the order, so it can only be shown again.
 */
function ColorRow({
  id,
  color,
  index,
  drafts,
  disabled,
  onChange,
  actions,
}: {
  readonly id: string;
  readonly color: HighlightColorKey;
  readonly index: number;
  readonly drafts: Drafts;
  readonly disabled: boolean;
  readonly onChange: (field: Field, drafts: Drafts) => void;
  readonly actions: RowActions;
}): JSX.Element {
  const label = highlightPalette[color].label;
  const shown = drafts.offered.includes(color);
  const lastShown = shown && drafts.offered.length === 1;
  return (
    <li className={`highlight-color-row${shown ? "" : " is-hidden"}`} data-highlight-color={color}>
      <i aria-hidden="true" />
      <span className="highlight-color-name">{label}</span>
      <input
        type="text"
        className="mdbase-field"
        aria-label={`${label} meaning`}
        value={drafts.meanings[color]}
        placeholder={`e.g. ${highlightMeaningSuggestions[color]}`}
        maxLength={highlightMeaningMaxLength}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) =>
          onChange("highlight_meanings", {
            ...drafts,
            meanings: { ...drafts.meanings, [color]: event.target.value },
          })
        }
      />
      <span className="highlight-color-actions">
        {shown ? (
          <>
            <button
              type="button"
              id={`${id}-${color}-up`}
              className="highlight-color-move"
              aria-label={`Move ${label} up`}
              title="Move up"
              disabled={disabled || index === 0}
              onClick={() => actions.move(color, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              id={`${id}-${color}-down`}
              className="highlight-color-move"
              aria-label={`Move ${label} down`}
              title="Move down"
              disabled={disabled || index === drafts.offered.length - 1}
              onClick={() => actions.move(color, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              id={`${id}-${color}-hide`}
              aria-label={`Hide ${label}`}
              aria-describedby={lastShown ? `${id}-one` : undefined}
              disabled={disabled || lastShown}
              onClick={() => actions.hide(color)}
            >
              Hide
            </button>
          </>
        ) : (
          <button
            type="button"
            id={`${id}-${color}-show`}
            aria-label={`Show ${label}`}
            disabled={disabled}
            onClick={() => actions.show(color)}
          >
            Show
          </button>
        )}
      </span>
    </li>
  );
}

/** Saving the edits, and what to tell the user afterwards. */
function useSave(
  settings: ReaderSettingsStore,
  editor: DraftEditor,
): {
  readonly pending: boolean;
  /** Pending, and edited by the user: this device's old meanings alone are not an edit. */
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly message: Message | null;
  readonly save: () => Promise<void>;
} {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const changes = editor.changes();
  const hasChanges = Object.keys(changes).length > 0;
  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    const result = hasChanges
      ? await settings.save(changes, editor.base)
      : ({ ok: true, snapshot: settings.getSnapshot() } as const);
    setSaving(false);
    if (result.ok) {
      // This device's old meanings are now either the collection's or deliberately cleared.
      forgetDeviceHighlightMeanings();
      editor.rebase(result.snapshot);
      setMessage({ text: "Saved for everyone using this collection.", error: false });
      return;
    }
    if (result.reason === "conflict") {
      editor.rebase(result.snapshot, true);
      const names = (["highlight_colors", "highlight_meanings"] as const)
        .filter((field) => result.fields?.includes(field))
        .map((field) => fieldNames[field]);
      if (names.length > 0) {
        setMessage({
          text: `The ${names.join(" and ")} changed somewhere else. Review and save again.`,
          error: true,
        });
        return;
      }
    }
    setMessage({ text: result.message, error: true });
  };
  return {
    pending: hasChanges || editor.fromDevice,
    dirty: hasChanges && editor.touched,
    saving,
    message,
    save,
  };
}

interface RowActions {
  readonly announcement: string;
  readonly move: (color: HighlightColorKey, by: -1 | 1) => void;
  readonly hide: (color: HighlightColorKey) => void;
  readonly show: (color: HighlightColorKey) => void;
}

/**
 * Moving, hiding and showing a colour. Focus follows the colour: it stays on the button that
 * moved it, or goes to the other one at an end, and to Show or Hide when it changes group. Each
 * change is announced.
 */
function useRowActions(id: string, editor: DraftEditor): RowActions {
  const [done, setDone] = useState<{ focus: string; text: string } | null>(null);
  const { drafts } = editor;
  useEffect(() => {
    if (done) {
      document.getElementById(done.focus)?.focus();
    }
  }, [done]);
  const change = (offered: readonly HighlightColorKey[], focus: string, text: string): void => {
    editor.set("highlight_colors", { ...drafts, offered });
    setDone({ focus: `${id}-${focus}`, text });
  };
  return {
    announcement: done?.text ?? "",
    move: (key, by) => {
      const offered = [...drafts.offered];
      const from = offered.indexOf(key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= offered.length) {
        return;
      }
      offered.splice(from, 1);
      offered.splice(to, 0, key);
      const atEnd = by === -1 ? to === 0 : to === offered.length - 1;
      change(
        offered,
        `${key}-${(by === -1) !== atEnd ? "up" : "down"}`,
        `${highlightPalette[key].label} moved to position ${String(to + 1)} of ${String(offered.length)}.`,
      );
    },
    hide: (key) =>
      change(
        drafts.offered.filter((color) => color !== key),
        `${key}-show`,
        `${highlightPalette[key].label} hidden.`,
      ),
    show: (key) => {
      const offered = [...drafts.offered, key];
      change(
        offered,
        `${key}-hide`,
        `${highlightPalette[key].label} shown, at position ${String(offered.length)} of ${String(offered.length)}.`,
      );
    },
  };
}

interface DraftState {
  /** The last snapshot seen, so a new one is taken in once. */
  readonly seen: AppSettingsSnapshot<ReaderSettingsValues>;
  /** What the edits started from: a setting changed elsewhere since is a conflict. */
  readonly base: AppSettingsSnapshot<ReaderSettingsValues>;
  readonly fromDevice: boolean;
  readonly drafts: Drafts;
  readonly edited: ReadonlySet<Field>;
  /** Whether the user changed a meaning themselves, rather than only being offered this device's. */
  readonly typed: boolean;
}

interface DraftEditor {
  readonly drafts: Drafts;
  readonly base: AppSettingsSnapshot<ReaderSettingsValues>;
  /** The meaning fields hold this device's old meanings, not yet saved to the collection. */
  readonly fromDevice: boolean;
  /** The user changed something themselves. */
  readonly touched: boolean;
  readonly set: (field: Field, drafts: Drafts) => void;
  readonly reset: () => void;
  readonly changes: () => AppSettingsChanges<ReaderSettingsValues>;
  readonly rebase: (next: AppSettingsSnapshot<ReaderSettingsValues>, keepDrafts?: boolean) => void;
}

/**
 * The colours and meanings as edited, against the settings they were started from. Fields not
 * being edited follow the record live. Until the collection holds meanings, this device's own
 * old meanings fill the meaning fields, as an edit to save.
 */
function useDrafts(snapshot: AppSettingsSnapshot<ReaderSettingsValues>): DraftEditor {
  const [state, setState] = useState<DraftState>(() => initial(snapshot));
  if (snapshot !== state.seen) {
    const values = snapshot.settings.values;
    const live = draftsFrom(values.highlight_colors, values.highlight_meanings);
    // Another device saving meanings first replaces this device's suggestion, unless the user
    // has typed: then saving reports the conflict.
    const fromDevice =
      state.fromDevice && !Object.hasOwn(snapshot.settings.stored, "highlight_meanings");
    const keepMeanings = state.typed || fromDevice;
    const keepColors = state.edited.has("highlight_colors");
    const edited = new Set(
      [...state.edited].filter((field) => field !== "highlight_meanings" || keepMeanings),
    );
    setState({
      ...state,
      seen: snapshot,
      base: edited.size === 0 ? snapshot : state.base,
      fromDevice,
      drafts: {
        offered: keepColors ? state.drafts.offered : live.offered,
        meanings: keepMeanings ? state.drafts.meanings : live.meanings,
      },
      edited,
    });
  }
  return {
    drafts: state.drafts,
    base: state.base,
    fromDevice: state.fromDevice,
    touched: state.typed || state.edited.has("highlight_colors"),
    set: (field, drafts) =>
      setState((current) => ({
        ...current,
        drafts,
        edited: new Set([...current.edited, field]),
        typed: current.typed || field === "highlight_meanings",
      })),
    reset: () =>
      setState((current) => ({
        ...current,
        drafts: defaultDrafts,
        edited: new Set<Field>(["highlight_colors", "highlight_meanings"]),
        typed: true,
      })),
    changes: () => {
      const changes: { -readonly [Key in Field]?: ReaderSettingsValues[Key] | null } = {};
      const written = state.base.frontmatter ?? {};
      if (state.edited.has("highlight_colors")) {
        const colors = state.drafts.offered;
        if (same(colors, highlightColorKeys)) {
          // Back to Reader's default: remove the field rather than writing the default out.
          if (written["highlight_colors"] !== undefined) {
            changes.highlight_colors = null;
          }
        } else if (!same(colors, written["highlight_colors"])) {
          changes.highlight_colors = colors;
        }
      }
      if (state.edited.has("highlight_meanings")) {
        const meanings = cleanMeanings(state.drafts);
        if (Object.keys(meanings).length === 0) {
          if (written["highlight_meanings"] !== undefined) {
            changes.highlight_meanings = null;
          }
        } else if (!same(meanings, written["highlight_meanings"])) {
          changes.highlight_meanings = meanings;
        }
      }
      return changes;
    },
    rebase: (next, keepDrafts = false) =>
      setState((current) =>
        keepDrafts
          ? { ...current, seen: next, base: next }
          : { ...initial(next, false), seen: next },
      ),
  };
}

function initial(
  snapshot: AppSettingsSnapshot<ReaderSettingsValues>,
  offerDevice = true,
): DraftState {
  const values = snapshot.settings.values;
  const device = offerDevice ? deviceHighlightMeanings() : {};
  const fromDevice =
    !Object.hasOwn(snapshot.settings.stored, "highlight_meanings") &&
    Object.keys(device).length > 0;
  return {
    seen: snapshot,
    base: snapshot,
    fromDevice,
    drafts: draftsFrom(values.highlight_colors, fromDevice ? device : values.highlight_meanings),
    edited: new Set<Field>(fromDevice ? ["highlight_meanings"] : []),
    typed: false,
  };
}
