import { moveMenuFocus } from "@mdbase-dev/ui/popover";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { selectRow, type RowSelection } from "./library-row-selection.js";
import { readingStatusChoices, readingStatusLabel } from "./LibraryCells.js";

import type { ReadingStatus, SourceId, SourceSummary } from "@mdbase-reader/core";

export interface LibraryRowMenuTarget {
  readonly source: SourceSummary;
  readonly x: number;
  readonly y: number;
}

export interface LibraryRowMenuActions {
  readonly onOpen: (id: SourceId) => void;
  readonly onOpenBeside: (id: SourceId) => void;
  readonly onChangeStatus?: (id: SourceId, status: ReadingStatus) => void;
  readonly onRename?: (source: SourceSummary) => void;
  readonly onExport?: (sources: readonly SourceSummary[]) => void;
}

/**
 * One source's actions at the pointer, like a desktop context menu. It closes on an outside
 * pointer, Escape, scrolling, or after an item runs, and arrow keys move between items.
 */
export function LibraryRowMenu({
  target,
  actions,
  onClose,
}: {
  readonly target: LibraryRowMenuTarget;
  readonly actions: LibraryRowMenuActions;
  /** Dismissing returns focus to the row; an action that ran may have moved it on purpose. */
  readonly onClose: (dismissed: boolean) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const position = useMenuPosition(ref, target);
  useDismiss(ref, onClose);
  const { source } = target;
  const status = source.reading?.status ?? source.readingStatus ?? "inbox";
  const citekey = source.citation?.id;
  // Opening and renaming move focus themselves; other actions return it to the row.
  const run =
    (action: () => void, movesFocus = false) =>
    (): void => {
      onClose(!movesFocus);
      action();
    };
  // Rows are transformed for virtual scrolling, so the menu escapes them to stay fixed, while
  // staying inside the main landmark with the table it belongs to.
  return createPortal(
    <div
      ref={ref}
      className="reader-menu-panel library-row-menu"
      role="menu"
      tabIndex={-1}
      aria-label={`Actions for ${source.title}`}
      style={{ left: `${String(position.x)}px`, top: `${String(position.y)}px` }}
      onKeyDown={(event) => moveMenuFocus(event, ref.current)}
    >
      <button type="button" role="menuitem" onClick={run(() => actions.onOpen(source.id), true)}>
        Open
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={run(() => actions.onOpenBeside(source.id), true)}
      >
        Open beside
      </button>
      {actions.onRename ? (
        <button type="button" role="menuitem" onClick={run(() => actions.onRename?.(source), true)}>
          Rename…
        </button>
      ) : null}
      {citekey ? (
        <button
          type="button"
          role="menuitem"
          onClick={run(() => void navigator.clipboard.writeText(`@${citekey}`))}
        >
          Copy citekey <kbd>@{citekey}</kbd>
        </button>
      ) : null}
      {actions.onExport ? (
        <button type="button" role="menuitem" onClick={run(() => actions.onExport?.([source]))}>
          Export citation
        </button>
      ) : null}
      {actions.onChangeStatus ? (
        <>
          <span className="menu-label" role="presentation">
            Status
          </span>
          {readingStatusChoices.map((choice) => (
            <button
              key={choice}
              type="button"
              role="menuitemradio"
              aria-checked={choice === status}
              onClick={run(() => actions.onChangeStatus?.(source.id, choice))}
            >
              {readingStatusLabel(choice)}
            </button>
          ))}
        </>
      ) : null}
    </div>,
    document.querySelector("main") ?? document.body,
  );
}

/**
 * Row actions for the library table: a right-click, the context-menu key or Shift+F10 opens
 * them for a row, selecting it first so the menu and the selection agree.
 */
export function useLibraryRowMenu(input: {
  readonly sources: readonly SourceSummary[];
  readonly selection: RowSelection;
  readonly rowIds: readonly SourceId[];
  readonly gridRef: RefObject<HTMLElement | null>;
  readonly onSelectionChange: (selection: RowSelection) => void;
  readonly onClosed: (index: number) => void;
  readonly actions: LibraryRowMenuActions;
}): {
  readonly open: (index: number, x: number, y: number) => void;
  readonly openFromKey: (event: ReactKeyboardEvent) => boolean;
  readonly element: JSX.Element | null;
} {
  const [menu, setMenu] = useState<(LibraryRowMenuTarget & { readonly index: number }) | null>(
    null,
  );
  const open = (index: number, x: number, y: number): void => {
    const source = input.sources[index];
    if (!source) {
      return;
    }
    if (!input.selection.ids.has(source.id)) {
      input.onSelectionChange(selectRow(input.selection, input.rowIds, index, "replace"));
    }
    setMenu({ source, index, x, y });
  };
  const openFromKey = (event: ReactKeyboardEvent): boolean => {
    const index = input.selection.active;
    if (
      (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) ||
      index === null
    ) {
      return false;
    }
    const box = input.gridRef.current
      ?.querySelector(`[data-row-index="${String(index)}"]`)
      ?.getBoundingClientRect();
    if (!box) {
      return false;
    }
    event.preventDefault();
    open(index, box.left + 24, box.top + box.height / 2);
    return true;
  };
  const close = useCallback((dismissed: boolean): void => {
    setMenu((current) => {
      if (current && dismissed) {
        input.onClosed(current.index);
      }
      return null;
    });
    // onClosed only refocuses a row; a stale copy of it is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    open,
    openFromKey,
    element: menu ? <LibraryRowMenu target={menu} actions={input.actions} onClose={close} /> : null,
  };
}

/** Keeps the menu inside the viewport, opening up or left when the pointer is near an edge. */
function useMenuPosition(
  ref: RefObject<HTMLDivElement | null>,
  target: LibraryRowMenuTarget,
): { readonly x: number; readonly y: number } {
  const [position, setPosition] = useState({ x: target.x, y: target.y });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) {
      return;
    }
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(target.x, window.innerWidth - width - 8)),
      y: target.y + height > window.innerHeight - 8 ? Math.max(8, target.y - height) : target.y,
    });
    menu.querySelector<HTMLElement>("[role^=menuitem]")?.focus({ preventScroll: true });
  }, [ref, target]);
  return position;
}

function useDismiss(
  ref: RefObject<HTMLDivElement | null>,
  onClose: (dismissed: boolean) => void,
): void {
  useEffect(() => {
    const dismiss = (): void => onClose(true);
    const onPointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) {
        // The pointer lands elsewhere, which takes focus itself.
        onClose(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof Element && event.target.closest("dialog[open]")) {
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [ref, onClose]);
}
