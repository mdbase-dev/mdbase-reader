/** What the reader asked for: the toolbar/shortcut, or a selection context-menu item. */
export type CaptureIntent = "capture" | "highlight" | "note";

export interface SelectionMessage {
  readonly type: "mdbase-reader/selection";
}
/** Sent to an already open panel when the reader invokes the extension on its tab again. */
export interface InvokeMessage {
  readonly type: "mdbase-reader/invoke";
  readonly tabId: number;
  readonly intent: CaptureIntent;
}
/** A panel saved or changed highlights; the background refreshes the tab's badge. */
export interface SourceChangedMessage {
  readonly type: "mdbase-reader/source-changed";
  readonly tabId: number;
}
export type ExtensionMessage = SelectionMessage | InvokeMessage | SourceChangedMessage;

/** The intent a newly opened panel should act on; consumed once. */
export function intentKey(tabId: number): string {
  return `intent:${String(tabId)}`;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    value.type.startsWith("mdbase-reader/")
  );
}

export function capturePanelPath(tabId: number): string {
  return `capture.html?tab=${String(tabId)}`;
}
