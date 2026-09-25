import { useEffect, useEffectEvent, useLayoutEffect, type RefObject } from "react";

import { listPlacement } from "./select-model.js";

/**
 * Shows a select's list in the top layer beside its trigger, focuses it, and dismisses it when
 * the pointer lands elsewhere or the page scrolls or resizes underneath it.
 */
export function useSelectPopover(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  const dismiss = useEffectEvent(onDismiss);
  useLayoutEffect(() => {
    const list = listRef.current;
    const trigger = triggerRef.current;
    if (!open || !list || !trigger) {
      return undefined;
    }
    list.showPopover();
    place(trigger, list);
    list.focus({ preventScroll: true });
    return () => {
      if (list.matches(":popover-open")) {
        list.hidePopover();
      }
    };
  }, [open, triggerRef, listRef]);
  useEffect(() => {
    const list = listRef.current;
    const trigger = triggerRef.current;
    if (!open || !list || !trigger) {
      return undefined;
    }
    const outside = (event: Event): void => {
      const target = event.target as Node | null;
      if (target && !list.contains(target) && !trigger.contains(target)) {
        dismiss();
      }
    };
    // Content under the list can move (a panel scrolls, a list re-renders): the list follows
    // its trigger, and closes only once the trigger has left the screen.
    const follow = (event: Event): void => {
      if (list.contains(event.target as Node | null)) {
        return;
      }
      if (onScreen(trigger)) {
        place(trigger, list);
      } else {
        dismiss();
      }
    };
    const onResize = (): void => dismiss();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", follow, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, triggerRef, listRef]);
}

function place(trigger: HTMLElement, list: HTMLElement): void {
  const box = trigger.getBoundingClientRect();
  list.style.minWidth = `${String(box.width)}px`;
  list.style.maxHeight = "";
  const placement = listPlacement(
    box,
    { width: list.offsetWidth, height: list.scrollHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  list.style.top = `${String(placement.top)}px`;
  list.style.left = `${String(placement.left)}px`;
  list.style.maxHeight = `${String(placement.maxHeight)}px`;
}

function onScreen(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.bottom > 0 &&
    box.top < window.innerHeight &&
    box.right > 0 &&
    box.left < window.innerWidth
  );
}
