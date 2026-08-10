import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { useEffect, useRef, type JSX } from "react";

import { textInsertionAtCursor, type TextInsertionRequest } from "./text-insertion.js";

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
}

export type MarkdownEditorProps = Omit<CodeEditorProps, "language">;

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
}: CodeEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);
  const insertedRequestRef = useRef<number | null>(null);

  useEffect(() => {
    changeRef.current = onChange;
    blurRef.current = onBlur;
  }, [onBlur, onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        languageExtension(language),
        placeholder ? placeholderExtension(placeholder) : [],
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            changeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({ blur: () => blurRef.current?.() }),
        readerEditorTheme,
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, language, placeholder, readOnly]);

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

function languageExtension(language: EditorLanguage): ReturnType<typeof markdown> | readonly [] {
  if (language === "markdown") {
    return markdown();
  }
  return language === "json" ? json() : [];
}
