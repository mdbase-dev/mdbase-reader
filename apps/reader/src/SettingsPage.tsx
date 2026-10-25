import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";

import { requestConfirmation } from "./confirmation.js";
import { BackIcon } from "./icons.js";
import { lazyFeature } from "./lazy-feature.js";
import "./settings.css";

import type { SettingsSectionsProps } from "./SettingsSections.js";

const SettingsSections = lazyFeature(
  async () => ({ default: (await import("./SettingsSections.js")).SettingsSections }),
  "settings",
);

/**
 * Whether the Settings page is open. It opens over the workspace, which stays as it was behind
 * it, and closing it returns focus to what opened it: the display menu's trigger when it was
 * opened from that menu.
 */
export function useSettingsPage(): {
  readonly open: boolean;
  readonly show: () => void;
  readonly hide: () => void;
} {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open && opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);
  return {
    open,
    show: useCallback(() => {
      const active = document.activeElement;
      // A menu item is gone once its menu closes, so return to the menu's trigger instead.
      const target = active?.closest("details")?.querySelector("summary") ?? active;
      opener.current = target instanceof HTMLElement ? target : null;
      setOpen(true);
      SettingsSections.preload();
    }, []),
    hide: useCallback(() => setOpen(false), []),
  };
}

/**
 * Reader's settings as a page: this device's, the open collection's, and the connection. The
 * workspace stays mounted and inert behind it, so open documents are not reloaded and nothing
 * behind it moves. Leaving with unsaved collection settings asks first.
 */
export function SettingsPage({
  density,
  onClose,
  ...sections
}: Omit<SettingsSectionsProps, "onDirtyChange" | "beforeLeave"> & {
  readonly density: "comfortable" | "compact";
  readonly onClose: () => void;
}): JSX.Element {
  const headingId = useId();
  const page = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(new Map<string, boolean>());
  useEffect(() => {
    heading.current?.focus();
    // Workspace shortcuts listen on the document; none should act on the workspace behind.
    const element = page.current;
    const stopShortcut = (event: KeyboardEvent): void => event.stopPropagation();
    element?.addEventListener("keydown", stopShortcut);
    return () => element?.removeEventListener("keydown", stopShortcut);
  }, []);
  const onDirtyChange = useCallback((name: string, value: boolean) => {
    dirty.current.set(name, value);
  }, []);
  const beforeLeave = useCallback(async (): Promise<boolean> => {
    const unsaved = [...dirty.current].filter(([, value]) => value).map(([name]) => name);
    return (
      unsaved.length === 0 ||
      requestConfirmation({
        title: "Leave without saving?",
        message: `Your changes to ${unsaved.join(" and ")} have not been saved.`,
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        danger: true,
      })
    );
  }, []);
  return (
    <div ref={page} className="settings-page" data-density={density}>
      <header className="settings-page-header">
        <button
          type="button"
          className="settings-page-back"
          onClick={() => {
            void beforeLeave().then((leave) => {
              if (leave) {
                onClose();
              }
            });
          }}
        >
          <BackIcon />
          Back
        </button>
      </header>
      <main className="settings-page-main" aria-labelledby={headingId}>
        <h1 id={headingId} ref={heading} tabIndex={-1}>
          Settings
        </h1>
        <SettingsSections {...sections} onDirtyChange={onDirtyChange} beforeLeave={beforeLeave} />
      </main>
    </div>
  );
}
