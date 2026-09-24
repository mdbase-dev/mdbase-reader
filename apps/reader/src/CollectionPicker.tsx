import { createContext, useContext, useEffect, useId, useRef, useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { CollectionIcon } from "./icons.js";
import "./collection-picker.css";

export interface CollectionSwitching {
  readonly collectionId: string;
  readonly connections: readonly { readonly collectionId: string; readonly displayName: string }[];
  readonly select: (collectionId: string) => void;
  readonly connect: () => Promise<void>;
}
export const CollectionSwitchingContext = createContext<CollectionSwitching | null>(null);

export function CollectionPicker({
  name,
  beforeSwitch,
}: {
  readonly name: string;
  readonly beforeSwitch?: () => boolean;
}): JSX.Element {
  const switching = useContext(CollectionSwitchingContext);
  const [open, setOpen] = useState(false);
  const label = (
    <>
      <CollectionIcon />
      <span className="sr-only">Collection: </span>
      <span className="collection-context-name">{name}</span>
    </>
  );
  if (!switching) {
    return (
      <span className="collection-context" title={`Collection: ${name}`}>
        {label}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="collection-context collection-picker-trigger"
        aria-label={`Switch collection: ${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Switch collection"
        onClick={() => setOpen(true)}
      >
        {label}
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <CollectionPickerDialog
          name={name}
          switching={switching}
          beforeSwitch={beforeSwitch ?? (() => true)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function CollectionPickerDialog({
  name,
  switching,
  beforeSwitch,
  onClose,
}: {
  readonly name: string;
  readonly switching: CollectionSwitching;
  readonly beforeSwitch: () => boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);
  const choose = (id: string): void => {
    if (id === switching.collectionId) {
      onClose();
      return;
    }
    if (!beforeSwitch()) {
      return;
    }
    setError(null);
    try {
      switching.select(id);
      onClose();
    } catch (reason) {
      setError(readerErrorMessage(reason, "Reader could not switch collections."));
    }
  };
  const connect = async (): Promise<void> => {
    if (!beforeSwitch()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await switching.connect();
      onClose();
    } catch (reason) {
      setError(readerErrorMessage(reason, "Reader could not connect another collection."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="collection-picker-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>Choose a collection</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close collection picker"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="collection-picker-list">
        {switching.connections.map((connection) => {
          const current = connection.collectionId === switching.collectionId;
          return (
            <button
              type="button"
              key={connection.collectionId}
              disabled={busy}
              aria-current={current ? "true" : undefined}
              onClick={() => choose(connection.collectionId)}
            >
              <strong>{current ? name : connection.displayName}</strong>
              {current ? <small>Current collection</small> : null}
            </button>
          );
        })}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <footer>
        <button type="button" disabled={busy} onClick={() => void connect()}>
          {busy ? "Opening mdbase…" : "Connect another collection…"}
        </button>
      </footer>
    </dialog>
  );
}
