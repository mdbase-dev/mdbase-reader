import { useEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";

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
}: {
  readonly className?: string;
  readonly label: string;
  readonly title?: string;
  readonly trigger: ReactNode;
  readonly triggerClassName?: string;
  readonly align?: "start" | "end";
  readonly children: ReactNode;
}): JSX.Element {
  const ref = useDismissableDetails();
  return (
    <details ref={ref} className={`reader-menu is-${align}${className ? ` ${className}` : ""}`}>
      <summary className={triggerClassName} aria-label={label} title={title ?? label}>
        {trigger}
      </summary>
      <div className="reader-menu-panel">{children}</div>
    </details>
  );
}

/** Closes a details disclosure on an outside pointer, Escape, or after an item runs. */
export function useDismissableDetails(): RefObject<HTMLDetailsElement | null> {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    if (!details) {
      return;
    }
    const close = (): void => {
      details.open = false;
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (details.open && !details.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && details.open) {
        event.stopPropagation();
        close();
        details.querySelector("summary")?.focus();
      }
    };
    const onClick = (event: MouseEvent): void => {
      const item = (event.target as HTMLElement).closest("button, a");
      if (item && details.contains(item) && !item.closest("[data-menu-keep-open]")) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    details.addEventListener("keydown", onKeyDown);
    details.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      details.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("click", onClick);
    };
  }, []);
  return ref;
}
