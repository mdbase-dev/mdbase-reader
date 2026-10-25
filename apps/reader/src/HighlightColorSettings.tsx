import {
  cleanHighlightMeaning,
  highlightColorKeys,
  highlightMeaningMaxLength,
  highlightPalette,
  type AppSettingsChanges,
  type HighlightColorKey,
  type HighlightMeanings,
} from "@mdbase-reader/core";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type JSX } from "react";

import {
  deviceHighlightMeanings,
  forgetDeviceHighlightMeanings,
  highlightMeaningSuggestions,
} from "./highlight-colors.js";
import { ModalDialog } from "./ModalDialog.js";

import type {
  AppSettingsSnapshot,
  ReaderSettingsStore,
  ReaderSettingsValues,
} from "@mdbase-reader/connect";

type Field = "highlight_colors" | "highlight_meanings";

interface Drafts {
  /** Every colour, offered ones first in their order. */
  readonly order: readonly HighlightColorKey[];
  readonly shown: ReadonlySet<HighlightColorKey>;
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
    order: [...colors, ...highlightColorKeys.filter((key) => !colors.includes(key))],
    shown: new Set(colors),
    meanings: Object.fromEntries(
      highlightColorKeys.map((key) => [key, meanings[key] ?? ""]),
    ) as Record<HighlightColorKey, string>,
  };
}

const defaultDrafts = draftsFrom(highlightColorKeys, {});

function offered(drafts: Drafts): readonly HighlightColorKey[] {
  return drafts.order.filter((key) => drafts.shown.has(key));
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
  onClose,
}: {
  readonly settings: ReaderSettingsStore;
  readonly onClose: () => void;
}): JSX.Element {
  const id = useId();
  const snapshot = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const editor = useDrafts(snapshot);
  const { pending, saving, message, save } = useSave(settings, editor);
  const { moved, move } = useMove(id, editor);
  const first = useRef<HTMLHeadingElement>(null);
  const readOnly = snapshot.settings.readOnly;
  const disabled = Boolean(readOnly) || snapshot.status === "loading" || saving;
  const { drafts } = editor;
  const isDefault =
    same(offered(drafts), highlightColorKeys) && !Object.keys(cleanMeanings(drafts)).length;
  const warnings = snapshot.settings.warnings.filter(
    (warning) => warning.field === "highlight_colors" || warning.field === "highlight_meanings",
  );

  return (
    <ModalDialog
      className="library-save-modal highlight-color-settings-modal"
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      initialFocus={first}
      onDismiss={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      <form
        className="library-save-dialog highlight-color-settings"
        aria-label="Highlight colours"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && pending) {
            void save();
          }
        }}
      >
        <h2 id={`${id}-title`} ref={first} tabIndex={-1}>
          Highlight colours
        </h2>
        <p id={`${id}-description`}>
          Which colours Reader offers when you highlight, in this order, and what each means. Shared
          by everyone using this collection, on every device.
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
        <ol className="highlight-color-rows" aria-label="Colours, in the order Reader offers them">
          {drafts.order.map((key, index) => (
            <ColorRow
              key={key}
              id={id}
              color={key}
              index={index}
              drafts={drafts}
              disabled={disabled}
              onChange={editor.set}
              onMove={move}
            />
          ))}
        </ol>
        <p id={`${id}-one`} className="file-name-template-hint">
          At least one colour stays offered. The colour new highlights use is this device’s own: the
          one used last, or the first offered while that one is hidden.
        </p>
        <p className="sr-only" role="status">
          {moved}
        </p>
        <button
          type="button"
          className="highlight-color-reset"
          disabled={disabled || (isDefault && warnings.length === 0)}
          onClick={() => editor.reset()}
        >
          Reset to default
        </button>
        {message ? (
          <p
            className={`file-name-settings-message${message.error ? " is-error" : ""}`}
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
        <div>
          <button type="button" disabled={saving} onClick={onClose}>
            {pending ? "Cancel" : "Close"}
          </button>
          <button type="submit" disabled={disabled || !pending}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

/** One colour: whether it is offered, its meaning, and buttons to move it. */
function ColorRow({
  id,
  color,
  index,
  drafts,
  disabled,
  onChange,
  onMove,
}: {
  readonly id: string;
  readonly color: HighlightColorKey;
  readonly index: number;
  readonly drafts: Drafts;
  readonly disabled: boolean;
  readonly onChange: (field: Field, drafts: Drafts) => void;
  readonly onMove: (color: HighlightColorKey, by: -1 | 1) => void;
}): JSX.Element {
  const label = highlightPalette[color].label;
  const shown = drafts.shown.has(color);
  const lastShown = shown && drafts.shown.size === 1;
  return (
    <li className={`highlight-color-row${shown ? "" : " is-hidden"}`} data-highlight-color={color}>
      <i aria-hidden="true" />
      <label className="highlight-color-show">
        <input
          type="checkbox"
          checked={shown}
          disabled={disabled || lastShown}
          aria-describedby={lastShown ? `${id}-one` : undefined}
          onChange={(event) => {
            const next = new Set(drafts.shown);
            if (event.target.checked) {
              next.add(color);
            } else {
              next.delete(color);
            }
            onChange("highlight_colors", { ...drafts, shown: next });
          }}
        />
        <span>{label}</span>
        <span className="sr-only">{shown ? ", offered" : ", hidden"}</span>
      </label>
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
      <span className="highlight-color-move">
        <button
          type="button"
          id={`${id}-${color}-up`}
          aria-label={`Move ${label} up`}
          title="Move up"
          disabled={disabled || index === 0}
          onClick={() => onMove(color, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          id={`${id}-${color}-down`}
          aria-label={`Move ${label} down`}
          title="Move down"
          disabled={disabled || index === drafts.order.length - 1}
          onClick={() => onMove(color, 1)}
        >
          ↓
        </button>
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
  return { pending: hasChanges || editor.fromDevice, saving, message, save };
}

/**
 * Moving a colour up or down. Focus stays on the button that moved it, or goes to the other one
 * at an end, and the new place is announced.
 */
function useMove(
  id: string,
  editor: DraftEditor,
): { readonly moved: string; readonly move: (color: HighlightColorKey, by: -1 | 1) => void } {
  const [moved, setMoved] = useState<{
    key: HighlightColorKey;
    by: -1 | 1;
    text: string;
  } | null>(null);
  const { drafts } = editor;
  useEffect(() => {
    if (!moved) {
      return;
    }
    const index = drafts.order.indexOf(moved.key);
    const atEnd = moved.by === -1 ? index === 0 : index === drafts.order.length - 1;
    const direction = (moved.by === -1) !== atEnd ? "up" : "down";
    document.getElementById(`${id}-${moved.key}-${direction}`)?.focus();
  }, [drafts.order, id, moved]);
  const move = (key: HighlightColorKey, by: -1 | 1): void => {
    const order = [...drafts.order];
    const from = order.indexOf(key);
    const to = from + by;
    if (to < 0 || to >= order.length) {
      return;
    }
    order.splice(from, 1);
    order.splice(to, 0, key);
    editor.set("highlight_colors", { ...drafts, order });
    setMoved({
      key,
      by,
      text: `${highlightPalette[key].label} moved to position ${String(to + 1)} of ${String(order.length)}.`,
    });
  };
  return { moved: moved?.text ?? "", move };
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
        order: keepColors ? state.drafts.order : live.order,
        shown: keepColors ? state.drafts.shown : live.shown,
        meanings: keepMeanings ? state.drafts.meanings : live.meanings,
      },
      edited,
    });
  }
  return {
    drafts: state.drafts,
    base: state.base,
    fromDevice: state.fromDevice,
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
        const colors = offered(state.drafts);
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
