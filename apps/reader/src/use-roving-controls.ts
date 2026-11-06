import { useLayoutEffect, useRef } from "react";

export function useRovingControls(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) {
      return undefined;
    }
    const controls = Array.from(host.querySelectorAll<HTMLElement>("button, summary")).filter(
      (control) => !control.closest(".reader-menu-panel") && !control.matches(":disabled"),
    );
    const setActive = (active: HTMLElement): void => {
      for (const control of controls) {
        control.tabIndex = control === active ? 0 : -1;
      }
    };
    const first = controls.find((control) => control.tabIndex === 0) ?? controls[0];
    if (first) {
      setActive(first);
    }
    const focus = (event: FocusEvent): void => {
      const target = event.target as HTMLElement;
      if (controls.includes(target)) {
        setActive(target);
      }
    };
    const key = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const index = controls.indexOf(event.target as HTMLElement);
      if (index < 0 || (event.target as HTMLElement).closest("details[open]")) {
        return;
      }
      const next =
        event.key === "ArrowRight"
          ? controls[(index + 1) % controls.length]
          : event.key === "ArrowLeft"
            ? controls[(index + controls.length - 1) % controls.length]
            : event.key === "Home"
              ? controls[0]
              : event.key === "End"
                ? controls.at(-1)
                : undefined;
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        next.focus();
      }
    };
    host.addEventListener("focusin", focus);
    host.addEventListener("keydown", key);
    return () => {
      host.removeEventListener("focusin", focus);
      host.removeEventListener("keydown", key);
    };
  });
  return ref;
}
