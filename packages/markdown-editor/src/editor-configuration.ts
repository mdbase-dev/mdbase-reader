import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { linter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { markdownCommand, type MarkdownCommandName } from "./markdown-commands.js";

import type { EditorLanguage, EditorProfile } from "./markdown-editor.js";

const readerHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--ink)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--ink-soft)", fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--accent)", textDecoration: "none" },
  { tag: [tags.meta, tags.processingInstruction], color: "var(--faint)" },
  { tag: tags.punctuation, color: "var(--muted)" },
  { tag: tags.monospace, color: "var(--ink-soft)", fontFamily: "var(--mono)" },
  { tag: tags.propertyName, color: "var(--accent)" },
  { tag: tags.string, color: "var(--ink-soft)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--connected)" },
  { tag: tags.invalid, color: "var(--danger)", textDecoration: "underline wavy" },
]);

export function editorConfiguration(input: {
  readonly ariaLabel: string;
  readonly language: EditorLanguage;
  readonly profile: EditorProfile;
  readonly placeholder: string | undefined;
  readonly readOnly: boolean;
  readonly onSave: (() => void) | undefined;
}): readonly Extension[] {
  return [
    languageExtension(input.language),
    editorFoundation(input.language, input.profile),
    input.placeholder ? placeholderExtension(input.placeholder) : [],
    EditorState.readOnly.of(input.readOnly),
    editorKeymap(input.language, input.profile, input.onSave),
    EditorView.editorAttributes.of({ "data-editor-profile": input.profile }),
    EditorView.contentAttributes.of({
      "aria-label": input.ariaLabel,
      spellcheck: input.profile === "code" ? "false" : "true",
      autocorrect: input.profile === "code" ? "off" : "on",
      autocapitalize: input.profile === "code" ? "off" : "sentences",
      writingsuggestions: input.profile === "code" ? "false" : "true",
    }),
  ];
}

const markdownBindings: readonly { readonly key: string; readonly name: MarkdownCommandName }[] = [
  { key: "Mod-b", name: "strong" },
  { key: "Mod-i", name: "emphasis" },
  { key: "Mod-k", name: "link" },
  { key: "Mod-`", name: "inline-code" },
  { key: "Mod-Alt-2", name: "heading" },
  { key: "Mod-Shift-.", name: "quote" },
  { key: "Mod-Shift-8", name: "bullet-list" },
];

function editorKeymap(
  language: EditorLanguage,
  profile: EditorProfile,
  onSave: (() => void) | undefined,
): Extension {
  return keymap.of([
    ...(onSave
      ? [
          {
            key: "Mod-s",
            run: () => {
              onSave();
              return true;
            },
          },
        ]
      : []),
    ...(language === "markdown"
      ? markdownBindings.map(({ key, name }) => ({ key, run: markdownCommand(name) }))
      : []),
    ...(profile === "code" ? [indentWithTab, ...foldKeymap] : []),
    ...closeBracketsKeymap,
    ...completionKeymap,
    ...searchKeymap,
    ...lintKeymap,
    ...defaultKeymap,
    ...historyKeymap,
  ]);
}

function editorFoundation(language: EditorLanguage, profile: EditorProfile): readonly Extension[] {
  return [
    syntaxHighlighting(readerHighlightStyle),
    drawSelection(),
    dropCursor(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorState.phrases.of(searchPhrases),
    // Keep the line being typed clear of the pane's bottom edge while a note grows.
    profile === "prose" ? EditorView.scrollMargins.of(() => ({ bottom: 72 })) : [],
    profile === "code"
      ? [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          foldGutter({ openText: "⌄", closedText: "›" }),
        ]
      : [],
    language === "json" ? linter(jsonParseLinter()) : [],
  ];
}

// CodeMirror's search panel labels are lower case; Reader writes controls in sentence case.
const searchPhrases = {
  next: "Next",
  previous: "Previous",
  all: "All",
  "match case": "Match case",
  regexp: "Regex",
  "by word": "Whole word",
  replace: "Replace",
  "replace all": "Replace all",
  close: "Close search",
};

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
