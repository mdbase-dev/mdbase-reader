import { useEffect, useState } from "react";

export interface Shortcut {
  readonly name: string;
  readonly description: string;
  /** Null when the user removed the key or another extension holds it. */
  readonly keys: string | null;
}

/** Descriptions as the manifest declares them; the keys are the user's current bindings. */
export function useShortcuts(): readonly Shortcut[] | null {
  const [shortcuts, setShortcuts] = useState<readonly Shortcut[] | null>(null);
  useEffect(() => {
    chrome.commands
      .getAll()
      .then((commands) =>
        setShortcuts(
          commands.map((command) => ({
            name: command.name ?? "",
            description: describe(command),
            keys: boundKeys(command.shortcut),
          })),
        ),
      )
      .catch(() => setShortcuts([]));
  }, []);
  return shortcuts;
}

/** Chrome leaves the toolbar button's command undescribed, whatever the manifest says. */
function describe(command: chrome.commands.Command): string {
  if (command.description) {
    return command.description;
  }
  return command.name === "_execute_action" ? "Open mdbase Reader for this page" : "";
}

/** Chrome reports an unbound command with an empty shortcut. */
function boundKeys(shortcut: string | undefined): string | null {
  if (!shortcut) {
    return null;
  }
  return shortcut;
}

/** Chrome's own shortcut editor; extensions cannot link to chrome:// pages directly. */
export function openShortcutSettings(): void {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => undefined);
}

export function openSettings(): void {
  void chrome.runtime.openOptionsPage().catch(() => undefined);
}
