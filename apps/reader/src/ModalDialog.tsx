import { useEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";

/** Mounted only while open; native modality keeps focus and the background out of reach. */
export function ModalDialog({
  children,
  className,
  labelledBy,
  describedBy,
  role,
  initialFocus,
  onDismiss,
}: {
  readonly children: ReactNode;
  readonly className: string;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly role?: "alertdialog";
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly onDismiss: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    initialFocus?.current?.focus();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [initialFocus]);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- native backdrop clicks target the dialog; Escape uses its cancel event.
    <dialog
      ref={dialog}
      className={`reader-modal ${className}`}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
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
