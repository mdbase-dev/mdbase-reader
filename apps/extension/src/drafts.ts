import { normalizedSourceUrl, type QuoteSelector } from "@mdbase-reader/core";

import { highlightColors, type CaptureDraft, type HighlightColor } from "./save-capture.js";

/**
 * Unsaved text survives closing the panel, reloading the extension page or switching
 * tabs, for the rest of the browser session. `chrome.storage.session` stays in memory
 * and is never written to disk.
 */
export interface StoredDraft {
  readonly draft: CaptureDraft;
  readonly selection: QuoteSelector | null;
}

export const emptyDraft: CaptureDraft = {
  title: "",
  tags: "",
  note: "",
  comment: "",
  highlight: false,
  color: "yellow",
  highlightTags: "",
};

function draftKey(tabId: number, url: string): string {
  let page = url;
  try {
    page = normalizedSourceUrl(url);
  } catch {
    // Keep the raw URL; a draft is only ever restored on the exact same page.
  }
  return `draft:${String(tabId)}:${page}`;
}

export async function loadDraft(tabId: number, url: string): Promise<StoredDraft | null> {
  try {
    const key = draftKey(tabId, url);
    const { [key]: value } = await chrome.storage.session.get(key);
    return isStoredDraft(value) ? { ...value, draft: { ...emptyDraft, ...value.draft } } : null;
  } catch {
    return null;
  }
}

export function saveDraft(tabId: number, url: string, value: StoredDraft): Promise<void> {
  const key = draftKey(tabId, url);
  const empty =
    !value.draft.note.trim() &&
    !value.draft.comment.trim() &&
    !value.draft.tags.trim() &&
    !value.selection;
  const write = empty
    ? chrome.storage.session.remove(key)
    : chrome.storage.session.set({ [key]: value });
  return write.catch(() => undefined);
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    typeof value.draft === "object" &&
    value.draft !== null
  );
}

const colorKey = "highlight-color";

/** The colour of the reader's last highlight, used for the next one on any page. */
export async function preferredColor(): Promise<HighlightColor> {
  try {
    const { [colorKey]: value } = await chrome.storage.local.get(colorKey);
    return highlightColors.find((color) => color === value) ?? emptyDraft.color;
  } catch {
    return emptyDraft.color;
  }
}

export function rememberColor(color: HighlightColor): void {
  void chrome.storage.local.set({ [colorKey]: color }).catch(() => undefined);
}
