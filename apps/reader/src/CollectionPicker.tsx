import { createContext, useContext, useId, useRef, useState, type JSX } from "react";

import { CollectionMenu } from "./CollectionMenu.js";
import { readerErrorMessage } from "./errors.js";
import { ChevronDownIcon, CollectionIcon } from "./icons.js";

import type { CollectionChoice } from "./collection-menu-model.js";
import "./collection-picker.css";

export interface CollectionSwitching {
  readonly collectionId: string;
  readonly connections: readonly CollectionChoice[];
  readonly select: (collectionId: string) => void;
  readonly connect: () => Promise<void>;
}
export const CollectionSwitchingContext = createContext<CollectionSwitching | null>(null);

export function CollectionPicker({
  name,
  beforeSwitch = () => true,
}: {
  readonly name: string;
  readonly beforeSwitch?: () => boolean;
}): JSX.Element {
  const switching = useContext(CollectionSwitchingContext);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const close = (refocus: boolean): void => {
    setOpen(false);
    setError(null);
    if (refocus) {
      triggerRef.current?.focus();
    }
  };
  const choose = (id: string): void => {
    if (id === switching.collectionId) {
      close(true);
      return;
    }
    // Unsaved edits can keep Reader here; the menu stays open for another choice.
    if (!beforeSwitch()) {
      return;
    }
    setError(null);
    try {
      switching.select(id);
      close(false);
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
      close(false);
    } catch (reason) {
      setError(readerErrorMessage(reason, "Reader could not connect another collection."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="collection-context collection-picker-trigger"
        aria-label={`Switch collection: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Switch collection"
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
        <ChevronDownIcon className="collection-picker-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <CollectionMenu
          id={menuId}
          triggerRef={triggerRef}
          currentId={switching.collectionId}
          currentName={name}
          choices={switching.connections}
          busy={busy}
          error={error}
          onChoose={choose}
          onConnect={() => void connect()}
          onClose={close}
        />
      ) : null}
    </>
  );
}
