import { CitationIcon, HighlightIcon, NoteIcon } from "@mdbase-reader/ui";
import { useRef, useState } from "react";

import type { ExtensionCaptureController } from "./capture-controller.js";

export type PanelTab = "highlights" | "note" | "citation";

const tabs: readonly {
  readonly id: PanelTab;
  readonly label: string;
  readonly Icon: typeof NoteIcon;
}[] = [
  { id: "highlights", label: "Highlights", Icon: HighlightIcon },
  { id: "note", label: "Note", Icon: NoteIcon },
  { id: "citation", label: "Citation", Icon: CitationIcon },
];

/**
 * The same three views of a source as Reader's inspector, drawn the same way. "Note" is
 * Reader's "Literature note", shortened so all three names fit a side panel.
 */
export function PanelTabs({
  tab,
  highlightCount,
  onChange,
}: {
  readonly tab: PanelTab;
  /** Saved highlights on this page's source; null before the page is saved. */
  readonly highlightCount: number | null;
  readonly onChange: (tab: PanelTab) => void;
}): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  // Arrow keys move between tabs and select them, as in a native tab strip.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const index = tabs.findIndex(({ id }) => id === tab);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    const target = next === null ? undefined : tabs[next];
    if (target) {
      event.preventDefault();
      onChange(target.id);
      list.current?.querySelector<HTMLElement>(`#${tabId(target.id)}`)?.focus();
    }
  };
  return (
    <div className="panel-tabs" role="tablist" aria-label="Source" ref={list}>
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          id={tabId(id)}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={panelId(id)}
          tabIndex={tab === id ? 0 : -1}
          title={label}
          onClick={() => onChange(id)}
          onKeyDown={onKeyDown}
        >
          <Icon />
          <span className="panel-tab-label">{label}</span>
          {id === "highlights" && highlightCount !== null ? (
            <span className="panel-tab-count">{highlightCount}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function PanelTabContent({
  tab,
  children,
}: {
  readonly tab: PanelTab;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      className="panel-tab-content"
      role="tabpanel"
      id={panelId(tab)}
      aria-labelledby={tabId(tab)}
    >
      {children}
    </section>
  );
}

function tabId(tab: PanelTab): string {
  return `panel-tab-${tab}`;
}

function panelId(tab: PanelTab): string {
  return `panel-${tab}`;
}

/**
 * The open tab. A new selection on the page brings Highlights forward, since choosing its
 * colour is the next step, unless the reader is typing in the panel at that moment.
 */
export function usePanelTab(
  c: ExtensionCaptureController,
  initial: PanelTab = "highlights",
): readonly [PanelTab, (tab: PanelTab) => void] {
  const [tab, setTab] = useState<PanelTab>(initial);
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const intent = c.invocation;
  // Adjusted while rendering, as for the draft's selection, rather than in an effect.
  const [seen, setSeen] = useState({ selection, intent });
  if (seen.selection !== selection || seen.intent !== intent) {
    setSeen({ selection, intent });
    // The comment shortcut focuses the highlight's comment, which lives on Highlights.
    const invoked = intent !== seen.intent && intent !== null;
    const selected = selection !== seen.selection && selection !== null && !typingInPanel();
    if (invoked || selected) {
      setTab("highlights");
    }
  }
  return [tab, setTab];
}

function typingInPanel(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const active = document.activeElement;
  return (
    document.hasFocus() &&
    active instanceof Element &&
    active.matches("input, textarea, [contenteditable], [role='combobox']")
  );
}
