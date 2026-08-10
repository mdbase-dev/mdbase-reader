import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";

import { SearchIcon } from "./icons.js";

export interface ReaderCommand {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly group: "Navigate" | "Workspace" | "Source" | "Export";
  readonly keywords?: string;
  readonly shortcut?: string;
  readonly run: () => void;
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
  const matches = useMemo(() => matchingCommands(commands, query).slice(0, 14), [commands, query]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    globalThis.setTimeout(() => inputRef.current?.focus(), 0);
    return () => previous?.focus();
  }, []);
  const run = (command: ReaderCommand): void => {
    onClose();
    command.run();
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
            placeholder="Type a command or source title…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => handleKeys(event, matches, active, setActive, run, onClose)}
          />
        </label>
        <div className="command-results" role="listbox" aria-label="Search results">
          {matches.length > 0 ? (
            matches.map((command, index) => (
              <CommandRow
                key={command.id}
                command={command}
                active={index === active}
                onRun={run}
              />
            ))
          ) : (
            <div className="command-empty">No matching command or source</div>
          )}
        </div>
        <footer>
          <span>↑↓ choose</span>
          <span>↵ run</span>
          <span>esc close</span>
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
  readonly onRun: (command: ReaderCommand) => void;
}): JSX.Element {
  return (
    <button type="button" role="option" aria-selected={active} onMouseDown={() => onRun(command)}>
      <span className="command-group">{command.group}</span>
      <span>
        <strong>{command.label}</strong>
        {command.detail ? <small>{command.detail}</small> : null}
      </span>
      {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
    </button>
  );
}

function matchingCommands(
  commands: readonly ReaderCommand[],
  query: string,
): readonly ReaderCommand[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return commands.filter((command) => {
    const content =
      `${command.label} ${command.detail ?? ""} ${command.group} ${command.keywords ?? ""}`.toLocaleLowerCase();
    return terms.every((term) => content.includes(term));
  });
}

function handleKeys(
  event: KeyboardEvent<HTMLInputElement>,
  matches: readonly ReaderCommand[],
  active: number,
  setActive: (value: number) => void,
  run: (command: ReaderCommand) => void,
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
      run(command);
    }
  }
}
