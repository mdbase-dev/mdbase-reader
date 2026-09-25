import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  hueOf,
  initials,
  locationLabel,
  orderedChoices,
  type CollectionChoice,
} from "./collection-menu-model.js";
import { CheckIcon, PlusIcon } from "./icons.js";

/** Collections worth a filter box; fewer fit at a glance. */
const filterThreshold = 7;

/**
 * The collection switcher's menu, dropped from its header trigger. It opens in the top layer
 * where supported, lists the current collection first, and closes on an outside pointer,
 * Escape (returning focus to the trigger), Tab or a resize.
 */
export function CollectionMenu({
  id,
  triggerRef,
  currentId,
  currentName,
  choices,
  busy,
  error,
  onChoose,
  onConnect,
  onClose,
}: {
  readonly id: string;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly currentId: string;
  readonly currentName: string;
  readonly choices: readonly CollectionChoice[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onChoose: (collectionId: string) => void;
  readonly onConnect: () => void;
  readonly onClose: (refocus: boolean) => void;
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  useMenuPlacement(menuRef, triggerRef, onClose, busy);
  const ordered = orderedChoices(choices, currentId, currentName);
  const visible = query.trim()
    ? ordered.filter(({ displayName }) =>
        displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : ordered;
  return (
    <div
      ref={menuRef}
      id={id}
      className="collection-menu"
      popover="manual"
      role="menu"
      aria-label="Switch collection"
      tabIndex={-1}
      onKeyDown={(event) => moveFocus(event, menuRef.current)}
    >
      <div className="collection-menu-heading" role="presentation">
        Collections
      </div>
      {ordered.length >= filterThreshold ? (
        <input
          className="collection-menu-filter"
          type="search"
          aria-label="Filter collections"
          placeholder="Filter collections"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="collection-menu-list" role="group" aria-label="Connected collections">
        {visible.map((choice) => (
          <CollectionItem
            key={choice.collectionId}
            choice={choice}
            current={choice.collectionId === currentId}
            disabled={busy}
            onChoose={onChoose}
          />
        ))}
        {visible.length === 0 ? (
          <p className="collection-menu-empty">No collections match “{query.trim()}”.</p>
        ) : null}
      </div>
      {error ? (
        <p className="collection-menu-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="collection-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="collection-menu-connect"
        disabled={busy}
        onClick={onConnect}
      >
        <PlusIcon />
        <span>{busy ? "Opening mdbase…" : "Connect another collection…"}</span>
      </button>
    </div>
  );
}

function CollectionItem({
  choice,
  current,
  disabled,
  onChoose,
}: {
  readonly choice: CollectionChoice;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly onChoose: (collectionId: string) => void;
}): JSX.Element {
  const place = locationLabel(choice);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={current}
      className="collection-menu-item"
      disabled={disabled}
      onClick={() => onChoose(choice.collectionId)}
    >
      <span
        className="collection-menu-mark"
        aria-hidden="true"
        style={{ "--hue": hueOf(choice.collectionId) } as CSSProperties}
      >
        {initials(choice.displayName)}
      </span>
      <span className="collection-menu-copy">
        <strong>{choice.displayName}</strong>
        {place || current ? (
          <small>{[current ? "Open now" : null, place].filter(Boolean).join(" · ")}</small>
        ) : null}
      </span>
      {current ? <CheckIcon className="collection-menu-check" aria-hidden="true" /> : null}
    </button>
  );
}

function useMenuPlacement(
  menuRef: RefObject<HTMLDivElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
  onClose: (refocus: boolean) => void,
  busy: boolean,
): void {
  const close = useEffectEvent(onClose);
  const locked = useEffectEvent(() => busy);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) {
      return undefined;
    }
    // Top layer where supported, so header overflow and stacking never hide the menu.
    if (typeof menu.showPopover === "function") {
      menu.showPopover();
    }
    const box = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    menu.style.width = `${String(width)}px`;
    menu.style.top = `${String(box.bottom + 6)}px`;
    menu.style.left = `${String(Math.max(8, Math.min(box.left, window.innerWidth - width - 8)))}px`;
    menu.style.maxHeight = `${String(window.innerHeight - box.bottom - 20)}px`;
    menu.querySelector<HTMLElement>('[aria-checked="true"], [role^="menuitem"]')?.focus();
    return () => {
      if (typeof menu.hidePopover === "function" && menu.matches(":popover-open")) {
        menu.hidePopover();
      }
    };
  }, [menuRef, triggerRef]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (
        target &&
        !locked() &&
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        close(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.key === "Escape" || event.key === "Tab") && !locked()) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        close(event.key === "Escape");
      }
    };
    const onResize = (): void => close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuRef, triggerRef]);
}

function moveFocus(event: KeyboardEvent, menu: HTMLElement | null): void {
  if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }
  const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
  const inFilter = document.activeElement?.matches(".collection-menu-filter") ?? false;
  if (inFilter && (event.key === "Home" || event.key === "End")) {
    return;
  }
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : inFilter
          ? 0
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
