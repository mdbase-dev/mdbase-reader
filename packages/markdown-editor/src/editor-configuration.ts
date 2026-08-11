import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, placeholder as placeholderExtension } from "@codemirror/view";

import type { EditorLanguage } from "./markdown-editor.js";

export function editorConfiguration(input: {
  readonly ariaLabel: string;
  readonly language: EditorLanguage;
  readonly placeholder: string | undefined;
  readonly readOnly: boolean;
}): readonly Extension[] {
  return [
    languageExtension(input.language),
    input.placeholder ? placeholderExtension(input.placeholder) : [],
    EditorState.readOnly.of(input.readOnly),
    EditorView.contentAttributes.of({ "aria-label": input.ariaLabel }),
  ];
}

export function dispatchPreservingFocus(
  view: EditorView,
  spec: Parameters<EditorView["dispatch"]>[0],
): void {
  const focused = view.hasFocus;
  view.dispatch(spec);
  if (focused) {
    view.focus();
  }
}

function languageExtension(language: EditorLanguage): ReturnType<typeof markdown> | readonly [] {
  if (language === "markdown") {
    return markdown();
  }
  return language === "json" ? json() : [];
}
