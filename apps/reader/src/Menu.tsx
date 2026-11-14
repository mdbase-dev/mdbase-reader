import { useEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useMenuPosition } from "./use-menu-position.js";

const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]';

/**
 * A disclosure menu built on native details/summary. It closes on an outside
 * pointer, Escape (returning focus to its trigger), or after a menu item runs.
 */
export function Menu({
  className,
  label,
  title,
  trigger,
  triggerClassName = "icon-button",
  align = "end",
  children,
  defer = false,
  onIntent,
}: {
  readonly className?: string;
  readonly label: string;
  readonly title?: string;
  readonly trigger: ReactNode;
  readonly triggerClassName?: string;
  readonly align?: "start" | "end";
  readonly children: ReactNode;
  readonly defer?: boolean;
  readonly onIntent?: () => void;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useDismissableDetails(panelRef, setOpen, container);
  const position = useMenuPosition(panelRef, open ? triggerRef : null, align);
  const panel = (
    <div className={`reader-menu-portal${className ? ` ${className}` : ""}`}>
      <div
        ref={panelRef}
        className="reader-menu-panel"
        hidden={!open}
        style={{ left: position.x, top: position.y }}
      >
        {!defer || container !== null ? children : null}
      </div>
    </div>
  );
  return (
    <details
      ref={ref}
      className={`reader-menu is-${align}${className ? ` ${className}` : ""}`}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) {
          setContainer(document.querySelector("main") ?? document.body);
        }
      }}
    >
      <summary
        ref={triggerRef}
        className={triggerClassName}
        aria-label={label}
        title={title ?? label}
        onPointerEnter={onIntent}
        onFocus={onIntent}
      >
        {trigger}
      </summary>
      {container ? createPortal(panel, container) : panel}
    </details>
  );
}

function useDismissableDetails(
  panelRef: RefObject<HTMLDivElement | null>,
  setOpen: (open: boolean) => void,
  container: HTMLElement | null,
): RefObject<HTMLDetailsElement | null> {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    const panel = panelRef.current;
    const trigger = details?.querySelector("summary");
    if (!details || !panel || !trigger) {
      return;
    }
    const close = (): void => {
      details.open = false;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (
        details.open &&
        !details.contains(event.target as Node) &&
        !panel.contains(event.target as Node)
      ) {
        close();
      }
    };
    const onClick = (event: MouseEvent): void => {
      const item = (event.target as HTMLElement).closest("button, a");
      if (item && panel.contains(item) && !item.closest("[data-menu-keep-open]")) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!details.open) {
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        trigger.focus();
      } else if (event.key === "Tab") {
        moveDisclosureFocus(event, panel, trigger, close);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    panel.addEventListener("click", onClick);
    panel.addEventListener("keydown", onKeyDown);
    details.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      panel.removeEventListener("click", onClick);
      panel.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("keydown", onKeyDown);
    };
  }, [container, panelRef, setOpen]);
  return ref;
}

function moveDisclosureFocus(
  event: KeyboardEvent,
  panel: HTMLDivElement,
  trigger: HTMLElement,
  close: () => void,
): void {
  const controls = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  );
  const first = controls[0];
  const boundary = event.shiftKey ? first : controls.at(-1);
  if (event.target === trigger) {
    if (!event.shiftKey && first) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey) {
      close();
    }
  } else if (event.target === boundary) {
    trigger.focus();
    if (event.shiftKey) {
      event.preventDefault();
    } else {
      close();
    }
  }
}
