import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, type JSX } from "react";

import { annotationEditorExtensions } from "./annotation-widgets.js";
import { dispatchPreservingFocus, editorConfiguration } from "./editor-configuration.js";
import { textInsertionAtCursor, type TextInsertionRequest } from "./text-insertion.js";

import type { WikiLinkCandidate } from "./completions.js";

export type EditorLanguage = "markdown" | "json" | "plain";

export interface CodeEditorProps {
  readonly value: string;
  readonly ariaLabel: string;
  readonly language?: EditorLanguage;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly insertion?: TextInsertionRequest | null;
  readonly wikiLinks?: readonly WikiLinkCandidate[];
  readonly onOpenWikiLink?: (path: string) => void;
}

export type MarkdownEditorProps = Omit<CodeEditorProps, "language">;

const noWikiLinks: readonly WikiLinkCandidate[] = [];

const readerEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--ink)",
    backgroundColor: "var(--paper)",
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", sans-serif',
    fontSize: "15px",
  },
  ".cm-content": { padding: "16px 20px", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0", lineHeight: "1.55" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selected)",
  },
  ".cm-gutters": { display: "none" },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip-autocomplete": {
    overflow: "hidden",
    border: "1px solid var(--line-strong)",
    borderRadius: "6px",
    backgroundColor: "var(--paper)",
    boxShadow: "0 18px 48px -24px var(--color-scrim)",
  },
  ".cm-tooltip-autocomplete > ul": {
    maxHeight: "320px",
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", sans-serif',
  },
  ".cm-tooltip-autocomplete > ul > li": { minHeight: "48px", padding: "8px 12px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--selected)",
    color: "var(--ink)",
  },
  ".cm-completionLabel": { color: "var(--ink)", fontSize: "13px", fontWeight: "600" },
  ".cm-completionDetail": { color: "var(--muted)", fontSize: "11px", fontStyle: "normal" },
  ".cm-completionIcon": { color: "var(--accent)" },
  ".cm-annotation-embed": {
    width: "calc(100% - 8px)",
    margin: "10px 4px",
    padding: "14px 16px 12px",
    border: "1px solid var(--line)",
    borderLeft: "3px solid var(--accent)",
    borderRadius: "5px",
    color: "var(--ink)",
    background: "color-mix(in oklch, var(--paper) 96%, var(--accent))",
    boxShadow: "0 12px 32px -30px var(--color-scrim)",
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", sans-serif',
    whiteSpace: "normal",
  },
  ".cm-annotation-embed header, .cm-annotation-embed footer": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  ".cm-annotation-embed header span": {
    color: "var(--accent)",
    fontFamily: "var(--mono)",
    fontSize: "10px",
    letterSpacing: ".06em",
    textTransform: "uppercase",
  },
  ".cm-annotation-embed header small": { color: "var(--muted)", fontSize: "11px" },
  ".cm-annotation-embed blockquote": {
    margin: "12px 0 8px",
    color: "var(--ink)",
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: "15px",
    lineHeight: "1.55",
  },
  ".cm-annotation-embed p": {
    margin: "8px 0",
    color: "var(--ink-soft)",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  ".cm-annotation-embed footer": {
    marginTop: "12px",
    paddingTop: "9px",
    borderTop: "1px solid var(--line)",
  },
  ".cm-annotation-embed code": {
    overflow: "hidden",
    color: "var(--muted)",
    fontFamily: "var(--mono)",
    fontSize: "10px",
    textOverflow: "ellipsis",
  },
  ".cm-annotation-embed button": {
    flex: "0 0 auto",
    padding: "5px 8px",
    borderRadius: "3px",
    color: "var(--ink-soft)",
    background: "var(--canvas)",
    fontSize: "11px",
    cursor: "pointer",
  },
});

export function CodeEditor({
  value,
  ariaLabel,
  language = "plain",
  placeholder,
  readOnly = false,
  className,
  onChange,
  onBlur,
  insertion,
  wikiLinks = noWikiLinks,
  onOpenWikiLink,
}: CodeEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const initialConfigurationRef = useRef({ ariaLabel, language, placeholder, readOnly });
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);
  const openWikiLinkRef = useRef(onOpenWikiLink);
  const configurationCompartmentRef = useRef(new Compartment());
  const annotationCompartmentRef = useRef(new Compartment());
  const insertedRequestRef = useRef<number | null>(null);

  useEffect(() => {
    changeRef.current = onChange;
    blurRef.current = onBlur;
    openWikiLinkRef.current = onOpenWikiLink;
  }, [onBlur, onChange, onOpenWikiLink]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        configurationCompartmentRef.current.of(
          editorConfiguration(initialConfigurationRef.current),
        ),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            changeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({ blur: () => blurRef.current?.() }),
        annotationCompartmentRef.current.of([]),
        readerEditorTheme,
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    dispatchPreservingFocus(view, {
      effects: configurationCompartmentRef.current.reconfigure(
        editorConfiguration({ ariaLabel, language, placeholder, readOnly }),
      ),
    });
  }, [ariaLabel, language, placeholder, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    dispatchPreservingFocus(view, {
      effects: annotationCompartmentRef.current.reconfigure(
        wikiLinks.length > 0
          ? annotationEditorExtensions(wikiLinks, (path) => openWikiLinkRef.current?.(path))
          : [],
      ),
    });
  }, [wikiLinks]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) {
      return;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !insertion || insertedRequestRef.current === insertion.requestId) {
      return;
    }
    const change = textInsertionAtCursor(
      view.state.doc.toString(),
      view.state.selection.main.to,
      insertion,
    );
    insertedRequestRef.current = insertion.requestId;
    view.dispatch({
      changes: { from: change.from, insert: change.insert },
      selection: { anchor: change.cursor },
    });
    view.focus();
  }, [insertion]);

  return <div ref={hostRef} className={className} />;
}

export function MarkdownEditor(props: MarkdownEditorProps): JSX.Element {
  return <CodeEditor {...props} language="markdown" />;
}
