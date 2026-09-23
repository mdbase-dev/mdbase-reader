import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";

import { SearchIcon } from "./icons.js";
import { shortcutLabel } from "./Menu.js";

export interface ReaderCommand {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly group: "Open tabs" | "Current source" | "Sources" | "Library" | "Workspace" | "Display";
  readonly keywords?: string;
  readonly shortcut?: string;
  readonly run: () => void;
  /** A variant run with Shift+Enter or Shift+click, such as opening beside the document. */
  readonly alternate?: { readonly label: string; readonly run: () => void };
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  readonly open: boolean;
  readonly commands: readonly ReaderCommand[];
  readonly onClose: () => void;
}): JSX.Element | null {
  return open ? <OpenCommandPalette commands={commands} onClose={onClose} /> : null;
}

function OpenCommandPalette({
  commands,
  onClose,
}: {
  readonly commands: readonly ReaderCommand[];
  readonly onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLElement>(null);
  const matches = useMemo(() => matchingCommands(commands, query), [commands, query]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    globalThis.setTimeout(() => inputRef.current?.focus(), 0);
    return () => previous?.focus();
  }, []);
  const run = (command: ReaderCommand, alternate = false): void => {
    onClose();
    (alternate && command.alternate ? command.alternate.run : command.run)();
  };
  return (
    <dialog className="command-backdrop" open>
      <button
        className="command-dismiss"
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
      />
      {/* This region owns focus trapping for the modal's complete set of controls. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        ref={paletteRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Reader commands"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Tab") {
            trapFocus(event, paletteRef.current);
          }
        }}
      >
        <label className="command-search">
          <SearchIcon />
          <span className="sr-only">Search commands and sources</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search sources and commands"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => handleKeys(event, matches, active, setActive, run, onClose)}
          />
        </label>
        <div
          className="command-results"
          role="listbox"
          aria-label="Search results"
          aria-describedby="command-palette-hint"
        >
          {matches.length > 0 ? (
            matches.map((command, index) => (
              <Fragment key={command.id}>
                {command.group !== matches[index - 1]?.group ? (
                  <div className="command-group-heading" role="presentation">
                    {command.group}
                  </div>
                ) : null}
                <CommandRow command={command} active={index === active} onRun={run} />
              </Fragment>
            ))
          ) : (
            <div className="command-empty">No matching command or source</div>
          )}
        </div>
        <footer className="command-footer" id="command-palette-hint">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          {matches[active]?.alternate ? (
            <span>
              <kbd>{shortcutLabel("shift")}</kbd>
              <kbd>↵</kbd> {matches[active].alternate.label.toLocaleLowerCase()}
            </span>
          ) : null}
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </footer>
      </section>
    </dialog>
  );
}

function trapFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  if (!container) {
    return;
  }
  const items = [
    ...container.querySelectorAll<HTMLElement>("input, button, [tabindex]:not([tabindex='-1'])"),
  ];
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function CommandRow({
  command,
  active,
  onRun,
}: {
  readonly command: ReaderCommand;
  readonly active: boolean;
  readonly onRun: (command: ReaderCommand, alternate?: boolean) => void;
}): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(event) => onRun(command, event.shiftKey)}
    >
      <span>
        <strong>{command.label}</strong>
        {command.detail ? <small>{command.detail}</small> : null}
      </span>
      {command.alternate && active ? (
        <span className="command-alternate">
          {shortcutLabel("shift")}↵ {command.alternate.label}
        </span>
      ) : null}
      {command.shortcut ? <kbd>{shortcutLabel(command.shortcut)}</kbd> : null}
    </button>
  );
}

const browseLimit = 6;
const searchLimit = 40;

/** Without a query, show a few of each group; with one, rank label matches first. */
export function matchingCommands(
  commands: readonly ReaderCommand[],
  query: string,
): readonly ReaderCommand[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) {
    const counts = new Map<string, number>();
    return commands.filter((command) => {
      const count = counts.get(command.group) ?? 0;
      counts.set(command.group, count + 1);
      return command.group === "Open tabs" || count < browseLimit;
    });
  }
  const matches = commands.filter((command) => {
    const content =
      `${command.label} ${command.detail ?? ""} ${command.group} ${command.keywords ?? ""}`.toLocaleLowerCase();
    return terms.every((term) => content.includes(term));
  });
  const groups = [...new Set(matches.map(({ group }) => group))];
  return groups
    .flatMap((group) => matches.filter((command) => command.group === group))
    .slice(0, searchLimit);
}

function handleKeys(
  event: KeyboardEvent<HTMLInputElement>,
  matches: readonly ReaderCommand[],
  active: number,
  setActive: (value: number) => void,
  run: (command: ReaderCommand, alternate?: boolean) => void,
  close: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    setActive((active + direction + matches.length) % Math.max(1, matches.length));
  } else if (event.key === "Enter") {
    const command = matches[active];
    if (command) {
      event.preventDefault();
      run(command, event.shiftKey);
    }
  }
}
