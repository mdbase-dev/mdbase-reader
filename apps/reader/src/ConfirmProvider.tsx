import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";

import { readerConfirmation, type Confirm, type ConfirmationRequest } from "./confirmation.js";

import "./confirmation.css";

const ConfirmContext = createContext<Confirm>(readerConfirmation.confirm);
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({
  children,
  service = readerConfirmation,
}: {
  readonly children: ReactNode;
  readonly service?: typeof readerConfirmation;
}): JSX.Element {
  const request = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  useEffect(() => service.attach(), [service]);
  return (
    <ConfirmContext value={service.confirm}>
      {children}
      {request ? (
        <ConfirmationDialog
          key={request.id}
          request={request}
          answer={(accepted) => service.answer(request, accepted)}
        />
      ) : null}
    </ConfirmContext>
  );
}

function ConfirmationDialog({
  request,
  answer,
}: {
  readonly request: ConfirmationRequest;
  readonly answer: (accepted: boolean) => void;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const { options, opener } = request;
  useLayoutEffect(() => {
    const dialog = ref.current;
    // Keep workspace shortcuts out of the modal, without swallowing native Escape/Tab behavior.
    const stopShortcut = (event: KeyboardEvent): void => event.stopPropagation();
    dialog?.addEventListener("keydown", stopShortcut);
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.removeEventListener("keydown", stopShortcut);
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [request, opener]);
  return (
    <dialog
      ref={ref}
      className="reader-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onClose={(event) => {
        if (!event.currentTarget.open) {
          answer(false);
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        answer(false);
      }}
    >
      <h2 id={titleId}>{options.title}</h2>
      <p id={messageId}>{options.message}</p>
      <div className="reader-confirm-actions">
        <button
          ref={cancelRef}
          type="button"
          className="mdbase-button"
          onClick={() => answer(false)}
        >
          {options.cancelLabel}
        </button>
        <button
          type="button"
          className={`mdbase-button${options.danger ? " is-danger" : ""}`}
          onClick={() => answer(true)}
        >
          {options.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
