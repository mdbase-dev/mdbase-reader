import { useLayoutEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";

import { focusReadingPane } from "./focus-reading-pane.js";

const openers = new WeakMap<HTMLDialogElement, Element | null>();

/** Native modality keeps focus and the background out of reach through the exit transition. */
export function ModalDialog({
  children,
  className,
  labelledBy,
  describedBy,
  role,
  initialFocus,
  returnFocus,
  density,
  onDismiss,
  active = true,
}: {
  readonly children: ReactNode;
  readonly className: string;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly role?: "alertdialog";
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly returnFocus?: Element | null;
  readonly density?: "comfortable" | "compact";
  readonly onDismiss: () => void;
  readonly active?: boolean;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const focusedElement = document.activeElement;
    const before = document.querySelector(".workspace-pane.is-focused");
    const beforeSession = before?.getAttribute("data-session-id");
    const opener = returnFocus ?? dialogInvoker(focusedElement);
    const element = dialog.current;
    if (element) {
      openers.set(element, opener ?? null);
    }
    mounted.current = true;
    element?.showModal();
    initialFocus?.current?.focus();
    return () => {
      mounted.current = false;
      const after = document.querySelector(".workspace-pane.is-focused");
      const navigated =
        after && (after !== before || after.getAttribute("data-session-id") !== beforeSession);
      const restoreFocus = Boolean(element?.contains(document.activeElement)) || Boolean(navigated);
      const destination = after && (Boolean(navigated) || !opener?.isConnected) ? after : opener;
      element?.close();
      if (restoreFocus) {
        queueMicrotask(() => restoreDialogFocus(destination));
      }
    };
  }, [initialFocus, returnFocus, active]);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- native backdrop clicks target the dialog; Escape uses its cancel event.
    <dialog
      ref={dialog}
      className={`reader-modal ${className}`}
      data-density={density}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // App shortcuts listen on the document; none should act behind the modal.
      onKeyDown={(event) => event.stopPropagation()}
      onKeyDownCapture={(event) => {
        if (
          event.currentTarget.closest(".reader-overlay")?.getAttribute("data-state") === "closed"
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      // Browsers may close a dialog whose cancel was refused (repeated Escape without
      // user activation). The dialog is still open as far as React knows, so reopen it.
      onClose={(event) => {
        if (mounted.current && !event.currentTarget.open) {
          event.currentTarget.showModal();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onDismiss();
        }
      }}
    >
      {children}
    </dialog>
  );
}

function restoreDialogFocus(destination: Element | null | undefined): void {
  if (
    !(destination instanceof HTMLElement) ||
    !destination.isConnected ||
    destination.closest('[inert], [hidden], [aria-hidden="true"]') ||
    (document.querySelector("dialog[open]") && !destination.closest("dialog[open]"))
  ) {
    return;
  }
  if (destination.matches(".workspace-pane")) {
    focusReadingPane(destination);
  } else {
    destination.focus();
  }
}

export function dialogInvoker(focused: Element | null): Element | null | undefined {
  const parent = focused?.closest("dialog");
  if (parent) {
    return openers.get(parent);
  }
  if (focused?.closest('[role="menu"]')) {
    return (
      document.querySelector('.workspace-pane.is-focused [data-row-index][tabindex="0"]') ?? focused
    );
  }
  return focused?.closest("details")?.querySelector("summary") ?? focused;
}
