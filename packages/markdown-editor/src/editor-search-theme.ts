import { EditorView } from "@codemirror/view";

import { uiFont } from "./editor-theme.js";

export const readerSearchTheme = EditorView.theme({
  ".cm-panels": {
    color: "var(--ink-soft)",
    backgroundColor: "var(--paper)",
    fontFamily: uiFont,
    fontSize: "12px",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--line)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--line)" },
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "8px 44px 8px 12px",
  },
  // CodeMirror separates the find and replace rows with <br>, which a flex row ignores.
  ".cm-panel.cm-search br": { display: "none" },
  ".cm-panel.cm-search:has([name=replace])::after": {
    content: '""',
    order: "1",
    flexBasis: "100%",
    marginTop: "-6px",
  },
  ".cm-panel.cm-search [name=replace], .cm-panel.cm-search [name=replaceAll]": { order: "2" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
    margin: "0",
  },
  ".cm-panel.cm-search .cm-textfield": {
    flex: "1 1 180px",
    maxWidth: "280px",
    height: "28px",
    padding: "0 8px",
    border: "1px solid var(--line-strong)",
    borderRadius: "4px",
    color: "var(--ink)",
    backgroundColor: "var(--canvas)",
    font: "inherit",
    fontSize: "13px",
  },
  ".cm-panel.cm-search .cm-textfield:focus-visible": {
    borderColor: "var(--accent)",
    outline: "2px solid color-mix(in oklch, var(--accent) 30%, transparent)",
    outlineOffset: "0",
  },
  ".cm-panel.cm-search .cm-button": {
    height: "28px",
    padding: "0 10px",
    border: "1px solid var(--line)",
    borderRadius: "4px",
    color: "var(--ink-soft)",
    backgroundColor: "var(--paper)",
    backgroundImage: "none",
    font: "inherit",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-panel.cm-search .cm-button:hover": {
    color: "var(--ink)",
    backgroundColor: "var(--hover)",
  },
  ".cm-panel.cm-search .cm-button:active": { backgroundImage: "none" },
  ".cm-panel.cm-search .cm-button:focus-visible, .cm-panel.cm-search [name=close]:focus-visible": {
    outline: "2px solid var(--accent)",
    outlineOffset: "1px",
  },
  ".cm-panel.cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: "28px",
    padding: "0 4px",
    color: "var(--muted)",
    fontSize: "12px",
    cursor: "pointer",
  },
  ".cm-panel.cm-search input[type=checkbox]": {
    margin: "0",
    accentColor: "var(--accent)",
  },
  ".cm-panel.cm-search [name=close]": {
    top: "8px",
    right: "10px",
    width: "28px",
    height: "28px",
    borderRadius: "4px",
    color: "var(--muted)",
    fontSize: "16px",
    lineHeight: "1",
    cursor: "pointer",
  },
  ".cm-panel.cm-search [name=close]:hover": {
    color: "var(--ink)",
    backgroundColor: "var(--hover)",
  },
});
