import { useLayoutEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";

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
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const active = document.activeElement;
    const before = document.querySelector(".workspace-pane.is-focused");
    const parent = active?.closest("dialog");
    const opener =
      returnFocus ??
      (parent
        ? openers.get(parent)
        : (active?.closest("details")?.querySelector("summary") ?? active));
    const element = dialog.current;
    if (element) {
      openers.set(element, opener ?? null);
    }
    mounted.current = true;
    element?.showModal();
    initialFocus?.current?.focus();
    return () => {
      mounted.current = false;
      const restoreFocus = element?.contains(document.activeElement);
      const after = document.querySelector(".workspace-pane.is-focused");
      const destination = after && after !== before ? after : opener;
      element?.close();
      if (
        restoreFocus &&
        destination instanceof HTMLElement &&
        destination.isConnected &&
        !destination.closest('[inert], [hidden], [aria-hidden="true"]')
      ) {
        destination.focus();
      }
    };
  }, [initialFocus, returnFocus]);
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
