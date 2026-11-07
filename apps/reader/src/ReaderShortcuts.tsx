import { t as translate } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { shortcutLabel, type Command } from "@mdbase-dev/ui/command-palette";
import { ReaderButton } from "@mdbase-reader/ui";
import { useId, useRef, type JSX } from "react";

import { ModalDialog } from "./ModalDialog.js";
import { OverlayPresence } from "./OverlayPresence.js";

export function ReaderShortcuts(props: {
  readonly open: boolean;
  readonly commands: readonly Command[];
  readonly onClose: () => void;
  readonly groupLabel: (group: string) => string;
}): JSX.Element {
  return (
    <OverlayPresence open={props.open}>
      <ShortcutSheet {...props} />
    </OverlayPresence>
  );
}

function readerShortcutLabel(shortcut: string): string {
  return shortcutLabel(
    shortcut
      .replace(/\btab\b/gu, "Tab")
      .replace(/\bctrl\b/gu, "Ctrl")
      .replaceAll("ArrowLeft", "←")
      .replaceAll("ArrowRight", "→"),
  );
}

function ShortcutSheet({
  open,
  commands,
  onClose,
  groupLabel,
}: Parameters<typeof ReaderShortcuts>[0]): JSX.Element {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const shortcuts = commands.flatMap((command) =>
    command.shortcut ? [{ ...command, shortcut: command.shortcut }] : [],
  );
  return (
    <ModalDialog
      active={open}
      className="reader-shortcut-dialog"
      labelledBy={id}
      initialFocus={heading}
      onDismiss={onClose}
    >
      <section className="reader-shortcut-help" aria-labelledby={id}>
        <h2 ref={heading} id={id} tabIndex={-1}>
          <Trans>Keyboard shortcuts</Trans>
        </h2>
        <section>
          <h3>
            <Trans>Library</Trans>
          </h3>
          <dl>
            {[
              ["J / K", translate`Next / previous source`],
              ["X", translate`Select source`],
              ["S", translate`Change reading status`],
              ["F2", translate`Rename source`],
              ["Delete", translate`Remove source…`],
              ["Enter", translate`Open source`],
              ["/", translate`Search this view`],
            ].map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>
            <Trans>Reading</Trans>
          </h3>
          <dl>
            {[
              ["PageDown / Space", translate`Next page`],
              ["PageUp / Shift+Space", translate`Previous page`],
              ["Ctrl+Home", translate`Start of document`],
            ].map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {[...new Set(shortcuts.map((command) => command.group))].map((group) => (
          <section key={group}>
            <h3>{groupLabel(group)}</h3>
            <dl>
              {shortcuts
                .filter((command) => command.group === group)
                .map((command) => (
                  <div key={command.id}>
                    <dt>{command.label}</dt>
                    <dd>
                      <kbd>
                        {command.id === "keyboard-shortcuts"
                          ? "? / "
                          : command.id === "toggle-library"
                            ? "[ / "
                            : ""}
                        {readerShortcutLabel(command.shortcut)}
                      </kbd>
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </section>
      <footer className="reader-shortcut-footer">
        <ReaderButton type="button" onClick={onClose}>
          <Trans context="Reader shortcuts">Close</Trans>
        </ReaderButton>
      </footer>
    </ModalDialog>
  );
}
