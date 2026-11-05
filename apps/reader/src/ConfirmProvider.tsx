import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";

import { readerConfirmation, type Confirm, type ConfirmationRequest } from "./confirmation.js";
import { ModalDialog } from "./ModalDialog.js";
import { OverlayPresence } from "./OverlayPresence.js";

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
      <OverlayPresence open={Boolean(request)}>
        {request ? (
          <ConfirmationDialog
            key={request.id}
            request={request}
            answer={(accepted) => service.answer(request, accepted)}
          />
        ) : null}
      </OverlayPresence>
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const { options, opener } = request;
  return (
    <ModalDialog
      className="reader-confirm-dialog"
      labelledBy={titleId}
      describedBy={messageId}
      initialFocus={cancelRef}
      returnFocus={opener}
      onDismiss={() => answer(false)}
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
    </ModalDialog>
  );
}
