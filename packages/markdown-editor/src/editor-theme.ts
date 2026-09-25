import { EditorView } from "@codemirror/view";

export const uiFont = '"Atkinson Hyperlegible", "Segoe UI", sans-serif';
export const readingFont = 'Georgia, "Times New Roman", serif';

export const readerEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--ink)",
    backgroundColor: "var(--paper)",
    fontFamily: uiFont,
    fontSize: "15px",
  },
  ".cm-content": { padding: "16px 20px", caretColor: "var(--accent)" },
  '&[data-editor-profile="prose"] .cm-content, &[data-editor-profile="compact"] .cm-content': {
    fontFamily: uiFont,
  },
  '&[data-editor-profile="code"] .cm-content': { fontFamily: "var(--mono)" },
  ".cm-line": { padding: "0", lineHeight: "1.55" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selected)",
  },
  '&[data-editor-profile="prose"] .cm-gutters, &[data-editor-profile="compact"] .cm-gutters': {
    display: "none",
  },
  ".cm-gutters": {
    borderRight: "1px solid var(--line)",
    color: "var(--faint)",
    backgroundColor: "var(--canvas)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--accent) 5%, transparent)",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": {
    outline: "2px solid color-mix(in oklch, var(--accent) 48%, transparent)",
    outlineOffset: "-2px",
  },
  // A source note fills its pane like a page; the caret, not a frame, shows where typing lands.
  '&[data-editor-profile="prose"].cm-focused': { outline: "none" },
  '&[data-editor-profile="prose"] .cm-content': { paddingBottom: "min(35vh, 240px)" },
  ".cm-placeholder": { color: "var(--faint)" },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklch, var(--accent) 14%, transparent)",
  },
  ".cm-searchMatch": {
    borderRadius: "2px",
    backgroundColor: "color-mix(in oklch, var(--warning) 26%, transparent)",
    outline: "1px solid color-mix(in oklch, var(--warning) 45%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklch, var(--accent) 32%, transparent)",
    outline: "1px solid var(--accent)",
  },
  ".cm-wikilink.is-resolved": {
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in oklch, var(--accent) 35%, transparent)",
    textUnderlineOffset: "3px",
  },
  ".cm-wikilink.is-unresolved": {
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-citation-reference": {
    margin: "0 2px",
    padding: "0 4px",
    border: "0",
    borderBottom: "1px solid color-mix(in oklch, var(--accent) 42%, transparent)",
    borderRadius: "3px",
    color: "var(--ink-soft)",
    background: "color-mix(in oklch, var(--accent) 5%, transparent)",
    font: "inherit",
    fontSize: "13px",
    lineHeight: "1.35",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-citation-reference:hover, .cm-citation-reference:focus-visible": {
    color: "var(--ink)",
    background: "var(--selected)",
    outline: "none",
  },
  ".cm-citation-syntax.is-resolved": {
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in oklch, var(--accent) 30%, transparent)",
    textUnderlineOffset: "3px",
  },
  ".cm-citation-syntax.is-unresolved": {
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-annotation-embed": {
    width: "100%",
    margin: "14px 0",
    padding: "10px 0 10px 14px",
    border: "0",
    borderLeft: "2px solid var(--accent)",
    color: "var(--ink)",
    background: "transparent",
    fontFamily: uiFont,
    whiteSpace: "normal",
  },
  ".cm-annotation-embed header, .cm-annotation-embed footer": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  ".cm-annotation-embed header span": {
    color: "var(--muted)",
    fontSize: "10px",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  ".cm-annotation-embed header small": { color: "var(--muted)", fontSize: "11px" },
  ".cm-annotation-embed blockquote": {
    margin: "12px 0 8px",
    color: "var(--ink)",
    fontFamily: readingFont,
    fontSize: "15px",
    lineHeight: "1.55",
  },
  ".cm-annotation-embed p": {
    margin: "8px 0",
    color: "var(--ink-soft)",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  ".cm-annotation-embed footer": { marginTop: "12px" },
  ".cm-annotation-embed code": {
    overflow: "hidden",
    marginRight: "auto",
    color: "var(--faint)",
    fontFamily: "var(--mono)",
    fontSize: "9px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-annotation-embed button": {
    flex: "0 0 auto",
    padding: "5px 8px",
    borderRadius: "3px",
    color: "var(--ink-soft)",
    background: "transparent",
    fontSize: "11px",
    cursor: "pointer",
  },
  ".cm-annotation-embed button:hover": { color: "var(--ink)", background: "var(--hover)" },
  ".cm-annotation-embed button:focus-visible": {
    outline: "2px solid var(--accent)",
    outlineOffset: "2px",
  },
});
