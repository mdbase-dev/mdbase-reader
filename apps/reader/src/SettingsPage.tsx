import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useCallback, useId, useRef, useState, type JSX } from "react";

import { requestConfirmation } from "./confirmation.js";
import { BackIcon } from "./icons.js";
import { lazyFeature } from "./lazy-feature.js";
import { ModalDialog } from "./ModalDialog.js";
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
  return {
    open,
    show: useCallback(() => {
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
  useLocale();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(new Map<string, boolean>());
  const onDirtyChange = useCallback((name: string, value: boolean) => {
    dirty.current.set(name, value);
  }, []);
  const beforeLeave = useCallback(async (): Promise<boolean> => {
    const unsaved = [...dirty.current].filter(([, value]) => value).map(([name]) => name);
    const joined = unsaved
      .map((name) =>
        name === "highlight colours"
          ? translate`highlight colours`
          : name === "file names"
            ? translate`file names`
            : name,
      )
      .join(translate` and `);
    return (
      unsaved.length === 0 ||
      requestConfirmation({
        title: translate({ message: "Leave without saving?" }),
        message: translate`Your changes to ${joined} have not been saved.`,
        confirmLabel: translate({ message: "Discard changes" }),
        cancelLabel: translate({ message: "Keep editing" }),
        danger: true,
      })
    );
  }, []);
  return (
    <ModalDialog
      className="settings-page"
      density={density}
      labelledBy={headingId}
      initialFocus={heading}
      onDismiss={() => {
        void beforeLeave().then((leave) => {
          if (leave) {
            onClose();
          }
        });
      }}
    >
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
          <Trans>Back</Trans>
        </button>
      </header>
      <main className="settings-page-main" aria-labelledby={headingId}>
        <h1 id={headingId} ref={heading} tabIndex={-1}>
          <Trans>Settings</Trans>
        </h1>
        <SettingsSections {...sections} onDirtyChange={onDirtyChange} beforeLeave={beforeLeave} />
      </main>
    </ModalDialog>
  );
}
