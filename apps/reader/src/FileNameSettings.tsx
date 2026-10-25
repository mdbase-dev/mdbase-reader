import {
  nameTemplateFilters,
  nameTemplateProblem,
  readerSettingsDefinition,
  type AppSettingsSnapshot,
  type ReaderNameTemplateKey,
  type ReaderSettingsStore,
  type ReaderSettingsValues,
} from "@mdbase-reader/connect";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
} from "react";

import {
  annotationPreviewRows,
  sourcePreviewRows,
  type FileNamePreviewRow,
} from "./file-name-preview.js";
import { ModalDialog } from "./ModalDialog.js";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";

type Drafts = Record<ReaderNameTemplateKey, string>;

function templateDrafts(values: ReaderSettingsValues): Drafts {
  return {
    source_name_template: values.source_name_template,
    annotation_name_template: values.annotation_name_template,
  };
}

interface TemplateField {
  readonly key: ReaderNameTemplateKey;
  readonly label: string;
  readonly hint: string;
  readonly variables: string;
}

const fields: readonly TemplateField[] = [
  {
    key: "source_name_template",
    label: "Source notes",
    hint: "Chapters too. Use / to put notes in folders under sources/.",
    variables:
      "title, authors, author, year, type, publisher, site, id, short_id, date; for chapters parent_title, parent_author, parent_year, parent_stem",
  },
  {
    key: "annotation_name_template",
    label: "Annotations",
    hint: "Always directly under annotations/.",
    variables: "id, short_id, type, quote, words, page, color, date, source_stem",
  },
];

const defaults: Drafts = {
  source_name_template: readerSettingsDefinition.fields.source_name_template.default,
  annotation_name_template: readerSettingsDefinition.fields.annotation_name_template.default,
};

/**
 * The collection's file name templates, with a live preview against a few of the user's own
 * sources and annotations. Saved to the collection's Reader settings record, so they apply on
 * every device; they only name new items.
 */
export function FileNameSettings({
  settings,
  sources,
  library,
  loadAnnotations,
  onClose,
}: {
  readonly settings: ReaderSettingsStore;
  /** A few of the user's sources to preview with. */
  readonly sources: readonly SourceSummary[];
  /** The whole library, for a chapter's book. */
  readonly library: readonly SourceSummary[];
  readonly loadAnnotations: () => Promise<readonly Annotation[]>;
  readonly onClose: () => void;
}): JSX.Element {
  const id = useId();
  const snapshot = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const editor = useTemplateDrafts(snapshot);
  const changes = editor.changes();
  const { saving, message, save } = useSave(settings, editor, changes);
  const first = useRef<HTMLInputElement>(null);
  const problems = useTemplateProblems(editor.drafts);
  const previews = usePreviews(sources, library, loadAnnotations);
  const readOnly = snapshot.settings.readOnly;
  const loading = snapshot.status === "loading";
  const invalid = fields.some(({ key }) => problems[key]);
  return (
    <ModalDialog
      className="library-save-modal file-name-settings-modal"
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
        className="library-save-dialog file-name-settings"
        aria-label="File names"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !invalid && !readOnly && Object.keys(changes).length > 0) {
            void save();
          }
        }}
      >
        <h2 id={`${id}-title`}>File names</h2>
        <p id={`${id}-description`}>
          How Reader names new source notes and annotations in this collection, on every device.
          Changes only affect new items: existing files keep their names.
        </p>
        {readOnly ? (
          <p className="file-name-settings-notice" role="status">
            {readOnly}
          </p>
        ) : null}
        {fields.map((field, index) => (
          <TemplateInput
            key={field.key}
            id={`${id}-${field.key}`}
            field={field}
            value={editor.drafts[field.key]}
            problem={problems[field.key]}
            warning={
              snapshot.settings.warnings.find((warning) => warning.field === field.key)?.message
            }
            disabled={Boolean(readOnly) || loading || saving}
            inputRef={index === 0 ? first : undefined}
            onChange={(value) => editor.set(field.key, value)}
            preview={
              <TemplatePreview
                template={editor.drafts[field.key]}
                invalid={Boolean(problems[field.key])}
                {...previews[field.key]}
              />
            }
          />
        ))}
        <details className="file-name-settings-help">
          <summary>Filters</summary>
          <p>
            Write {"{{ variable }}"} and add filters with |, such as {"{{ title | slug:40 }}"}. The
            filters are {nameTemplateFilters.join(", ")}. Reader removes characters files cannot
            have and adds a short suffix when a name is taken.
          </p>
        </details>
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
            {Object.keys(changes).length > 0 ? "Cancel" : "Close"}
          </button>
          <button
            type="submit"
            disabled={
              saving || loading || invalid || Boolean(readOnly) || Object.keys(changes).length === 0
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function TemplateInput({
  id,
  field,
  value,
  problem,
  warning,
  disabled,
  inputRef,
  onChange,
  preview,
}: {
  readonly id: string;
  readonly field: TemplateField;
  readonly value: string;
  readonly problem: string | undefined;
  readonly warning: string | undefined;
  readonly disabled: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null> | undefined;
  readonly onChange: (value: string) => void;
  readonly preview: JSX.Element;
}): JSX.Element {
  const isDefault = value === defaults[field.key];
  const described = [`${id}-hint`, problem ? `${id}-problem` : "", warning ? `${id}-warning` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <fieldset className="file-name-template">
      <legend>{field.label}</legend>
      <div className="file-name-template-row">
        <input
          id={id}
          ref={inputRef}
          className="mdbase-field"
          aria-label={`${field.label} template`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={described}
          value={value}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled || (isDefault && !warning)}
          onClick={() => onChange(defaults[field.key])}
        >
          Reset to default
        </button>
      </div>
      <p id={`${id}-hint`} className="file-name-template-hint">
        {field.hint} Variables: {field.variables}.
      </p>
      {problem ? (
        <p id={`${id}-problem`} className="file-name-template-problem">
          {problem}
        </p>
      ) : null}
      {warning ? (
        <p id={`${id}-warning`} className="file-name-template-warning">
          The saved template cannot be used: {warning}
        </p>
      ) : null}
      {preview}
    </fieldset>
  );
}

interface PreviewSource {
  readonly rows: (template: string) => Promise<readonly FileNamePreviewRow[]>;
  readonly empty: string;
}

function TemplatePreview({
  template,
  invalid,
  rows,
  empty,
}: PreviewSource & {
  readonly template: string;
  readonly invalid: boolean;
}): JSX.Element {
  const [shown, setShown] = useState<readonly FileNamePreviewRow[] | null>(null);
  useEffect(() => {
    if (invalid) {
      return;
    }
    let current = true;
    void rows(template).then((next) => {
      if (current) {
        setShown(next);
      }
    });
    return () => {
      current = false;
    };
  }, [template, invalid, rows]);
  if (shown === null) {
    return <p className="file-name-preview-empty">Preparing a preview…</p>;
  }
  if (shown.length === 0) {
    return <p className="file-name-preview-empty">{empty}</p>;
  }
  return (
    <div className="file-name-preview">
      <span className="file-name-preview-label">{invalid ? "Last valid preview" : "Preview"}</span>
      <ul aria-label="Preview">
        {shown.map((row) => (
          <li key={row.key}>
            <span className="file-name-preview-item">{row.label}</span>
            <code>{row.path}</code>
            {row.usedDefault ? (
              <span className="file-name-preview-default">Nothing usable, so Reader’s name</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What each template is previewed against: a few of the user's sources and annotations. */
function usePreviews(
  sources: readonly SourceSummary[],
  library: readonly SourceSummary[],
  loadAnnotations: () => Promise<readonly Annotation[]>,
): Record<ReaderNameTemplateKey, PreviewSource> {
  const annotations = useAnnotationSamples(loadAnnotations);
  const sourceRows = useCallback(
    (template: string) => sourcePreviewRows(template, sources, library),
    [sources, library],
  );
  const annotationRows = useCallback(
    (template: string) => annotationPreviewRows(template, annotations ?? []),
    [annotations],
  );
  return {
    source_name_template: { rows: sourceRows, empty: "Add a source to preview its name." },
    annotation_name_template: {
      rows: annotationRows,
      empty:
        annotations === undefined
          ? "Loading annotations…"
          : "Make an annotation to preview its name.",
    },
  };
}

type Editor = ReturnType<typeof useTemplateDrafts>;

function useSave(
  settings: ReaderSettingsStore,
  editor: Editor,
  changes: Partial<Record<ReaderNameTemplateKey, string | null>>,
): {
  readonly saving: boolean;
  readonly message: { readonly text: string; readonly error: boolean } | null;
  readonly save: () => Promise<void>;
} {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    const result = await settings.save(changes, editor.base);
    setSaving(false);
    if (result.ok) {
      editor.rebase(result.snapshot);
      setMessage({ text: "Saved. New items in this collection use these names.", error: false });
      return;
    }
    if (result.reason === "conflict") {
      // Show what is there now; saving again replaces it knowingly.
      editor.rebase(result.snapshot, true);
      const names = fields
        .filter(({ key }) => result.fields?.includes(key))
        .map(({ label }) => `${label.toLowerCase()} template`);
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
  return { saving, message, save };
}

/** The fields as edited, against the settings they were started from. */
function useTemplateDrafts(snapshot: AppSettingsSnapshot<ReaderSettingsValues>): {
  readonly drafts: Drafts;
  readonly base: AppSettingsSnapshot<ReaderSettingsValues>;
  readonly set: (key: ReaderNameTemplateKey, value: string) => void;
  readonly changes: () => Partial<Record<ReaderNameTemplateKey, string | null>>;
  readonly rebase: (next: AppSettingsSnapshot<ReaderSettingsValues>, keepDrafts?: boolean) => void;
} {
  const [state, setState] = useState(() => ({
    /** The last snapshot seen, so a new one is taken in once. */
    seen: snapshot,
    /** What the edits started from: a setting changed elsewhere since is a conflict. */
    base: snapshot,
    drafts: templateDrafts(snapshot.settings.values),
    edited: new Set<ReaderNameTemplateKey>(),
  }));
  if (snapshot !== state.seen) {
    // Fields not being edited follow the record live, such as an edit from another device.
    const drafts = { ...state.drafts };
    for (const { key } of fields) {
      if (!state.edited.has(key)) {
        drafts[key] = snapshot.settings.values[key];
      }
    }
    setState({
      ...state,
      seen: snapshot,
      base: state.edited.size === 0 ? snapshot : state.base,
      drafts,
    });
  }
  return {
    drafts: state.drafts,
    base: state.base,
    set: (key, value) =>
      setState((current) => ({
        ...current,
        drafts: { ...current.drafts, [key]: value },
        edited: new Set([...current.edited, key]),
      })),
    changes: () => {
      const changes: Partial<Record<ReaderNameTemplateKey, string | null>> = {};
      // Only what the user edited: a saved template Reader cannot use shows the default, but
      // stays as written until someone changes or resets it.
      for (const { key } of fields.filter((field) => state.edited.has(field.key))) {
        const draft = state.drafts[key];
        const written = state.base.frontmatter?.[key];
        if (draft === defaults[key]) {
          // Back to Reader's default: remove the field rather than writing the default out.
          if (written !== undefined) {
            changes[key] = null;
          }
        } else if (draft !== written) {
          changes[key] = draft;
        }
      }
      return changes;
    },
    rebase: (next, keepDrafts = false) =>
      setState((current) => ({
        seen: next,
        base: next,
        drafts: keepDrafts ? current.drafts : templateDrafts(next.settings.values),
        edited: keepDrafts ? current.edited : new Set(),
      })),
  };
}

/** Why each draft cannot be saved, checked as it is typed. */
function useTemplateProblems(drafts: Drafts): Partial<Record<ReaderNameTemplateKey, string>> {
  const [problems, setProblems] = useState<Partial<Record<ReaderNameTemplateKey, string>>>({});
  const source = drafts.source_name_template;
  const annotation = drafts.annotation_name_template;
  useEffect(() => {
    let current = true;
    void Promise.all([nameTemplateProblem(source), nameTemplateProblem(annotation)]).then(
      ([sourceProblem, annotationProblem]) => {
        if (current) {
          setProblems({
            ...(sourceProblem ? { source_name_template: sourceProblem } : {}),
            ...(annotationProblem ? { annotation_name_template: annotationProblem } : {}),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [source, annotation]);
  return problems;
}

function useAnnotationSamples(
  load: () => Promise<readonly Annotation[]>,
): readonly Annotation[] | undefined {
  const [annotations, setAnnotations] = useState<readonly Annotation[] | undefined>(undefined);
  const loader = useRef(load);
  useEffect(() => {
    let current = true;
    loader
      .current()
      .then((loaded) => {
        if (current) {
          setAnnotations(loaded);
        }
      })
      .catch(() => {
        if (current) {
          setAnnotations([]);
        }
      });
    return () => {
      current = false;
    };
  }, []);
  return annotations;
}
