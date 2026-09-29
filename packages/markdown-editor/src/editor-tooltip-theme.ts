import { EditorView } from "@codemirror/view";

import { readingFont } from "./editor-theme.js";

// Reader's own popups on top of @mdbase-dev/ui's mdbasePopupTheme: the quotation preview
// beside an annotation completion, and the citation card. Tooltips are mounted on the
// document body (see use-code-editor), so they carry the editor's theme with them.
export const readerTooltipTheme = EditorView.theme({
  ".cm-completion-preview blockquote": {
    margin: "0",
    color: "var(--ink)",
    fontFamily: readingFont,
    fontSize: "13px",
  },
  ".cm-completion-preview p": { margin: "0" },
  ".cm-completion-preview blockquote + p": {
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid var(--line)",
  },
  ".cm-citation-card": {
    width: "max-content",
    maxWidth: "min(340px, calc(100vw - 24px))",
    fontSize: "12px",
    lineHeight: "1.45",
  },
  ".cm-citation-card section": { padding: "10px 12px 8px" },
  ".cm-citation-card section + section": { borderTop: "1px solid var(--line)" },
  ".cm-citation-card strong": { color: "var(--ink)", fontSize: "12px" },
  ".cm-citation-card p": { margin: "2px 0 0", color: "var(--ink-soft)" },
  ".cm-citation-card small": { display: "block", color: "var(--muted)", fontSize: "11px" },
  ".cm-citation-card footer": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 4px 4px 12px",
    borderTop: "1px solid var(--line)",
  },
  ".cm-citation-card code": {
    overflow: "hidden",
    marginRight: "auto",
    color: "var(--faint)",
    fontFamily: "var(--mono)",
    fontSize: "10px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-citation-actions": { display: "flex", gap: "2px", margin: "6px 0 0 -7px" },
  ".cm-citation-card button": {
    flex: "0 0 auto",
    padding: "4px 7px",
    border: "0",
    borderRadius: "3px",
    color: "var(--accent)",
    background: "transparent",
    font: "inherit",
    fontSize: "11px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-citation-card footer button": { color: "var(--ink-soft)", fontWeight: "400" },
  ".cm-citation-card button:hover": { color: "var(--ink)", background: "var(--hover)" },
  ".cm-citation-card button:focus-visible": {
    outline: "2px solid var(--accent)",
    outlineOffset: "1px",
  },
});
