import { Trans, useLingui } from "@lingui/react/macro";
import { matchingCommands, shortcutLabel, type Command } from "@mdbase-dev/ui/command-palette";
import { Fragment, useEffect, useId, useRef, useState, type JSX } from "react";

import { ModalDialog } from "./ModalDialog.js";
import { OverlayPresence } from "./OverlayPresence.js";

export function ReaderCommandPalette(props: {
  readonly open: boolean;
  readonly shortcuts?: boolean;
  readonly commands: readonly Command[];
  readonly onClose: () => void;
  readonly label: string;
  readonly placeholder: string;
  readonly showAll: readonly string[];
  readonly groupLabel: (group: string) => string;
}): JSX.Element {
  return (
    <OverlayPresence open={props.open}>
      <OpenPalette {...props} />
    </OverlayPresence>
  );
}

function OpenPalette({
  commands,
  onClose,
  label,
  placeholder,
  showAll,
  groupLabel,
  shortcuts,
}: Parameters<typeof ReaderCommandPalette>[0]): JSX.Element {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const id = useId();
  const matches = matchingCommands(
    shortcuts ? commands.filter((command) => command.shortcut) : commands,
    query,
    shortcuts ? [...new Set(commands.map((command) => command.group))] : showAll,
  ).toSorted((left, right) =>
    /^(keyboard|shortcuts|help)(\s+(shortcuts|help))?$/iu.test(query.trim())
      ? Number(right.id === "keyboard-shortcuts") - Number(left.id === "keyboard-shortcuts")
      : 0,
  );
  const selected = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    results.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const run = (command: Command, alternate: boolean): void => {
    onClose();
    (alternate && command.alternate ? command.alternate.run : command.run)();
  };
  return (
    <ModalDialog
      className="mdbase-command-palette"
      labelledBy={`${id}-title`}
      initialFocus={input}
      onDismiss={onClose}
    >
      <h2 id={`${id}-title`} className="sr-only">
        {label}
      </h2>
      <label className="mdbase-command-search">
        <span className="sr-only">{placeholder}</span>
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-activedescendant={matches[selected] ? `${id}-${String(selected)}` : undefined}
          aria-describedby={`${id}-hint`}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive(
                (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
                  Math.max(1, matches.length),
              );
            } else if (event.key === "Enter" && matches[selected]) {
              event.preventDefault();
              run(matches[selected], event.shiftKey);
            }
          }}
        />
      </label>
      {shortcuts ? <ShortcutHelp /> : null}
      <div
        ref={results}
        id={`${id}-results`}
        className="mdbase-command-results"
        role="listbox"
        aria-label={t({ message: "Results", context: "Reader commands" })}
      >
        {matches.map((command, index) => (
          <Fragment key={command.id}>
            {command.group !== matches[index - 1]?.group ? (
              <div className="mdbase-command-group" role="presentation">
                {groupLabel(command.group)}
              </div>
            ) : null}
            <button
              type="button"
              role="option"
              id={`${id}-${String(index)}`}
              aria-selected={index === selected}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => run(command, event.shiftKey)}
            >
              <span>
                <strong>{command.label}</strong>
                {command.detail ? <small>{command.detail}</small> : null}
              </span>
              {command.shortcut ? <kbd>{readerShortcutLabel(command.shortcut)}</kbd> : null}
            </button>
          </Fragment>
        ))}
        {matches.length === 0 ? (
          <p className="mdbase-command-empty">
            <Trans context="Reader commands">Nothing matches</Trans>
          </p>
        ) : null}
      </div>
      <PaletteHint id={`${id}-hint`} alternate={matches[selected]?.alternate} />
    </ModalDialog>
  );
}

function PaletteHint({
  id,
  alternate,
}: {
  readonly id: string;
  readonly alternate: Command["alternate"];
}): JSX.Element {
  return (
    <footer className="mdbase-command-footer" id={id}>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> <Trans context="Reader commands">to move</Trans>
      </span>
      <span>
        <kbd>↵</kbd> <Trans context="Reader commands">to open</Trans>
      </span>
      {alternate ? (
        <span>
          <kbd>{shortcutLabel("shift+↵")}</kbd> {alternate.label}
        </span>
      ) : null}
      <span>
        <kbd>
          <Trans context="Reader interface">Esc</Trans>
        </kbd>{" "}
        <Trans context="Reader commands">to close</Trans>
      </span>
      <span>
        <Trans>Search “shortcuts” for keyboard help</Trans>
      </span>
    </footer>
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

function ShortcutHelp(): JSX.Element {
  return (
    <section className="reader-shortcut-help">
      <h3>
        <Trans>Keyboard shortcuts</Trans>
      </h3>
      <p>
        <Trans>
          In source and annotation lists, use arrows, Home, End and Page Up/Down to move, then Enter
          to open. Escape closes overlays and returns focus.
        </Trans>
      </p>
    </section>
  );
}
