import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  readonly beforeSwitch?: () => boolean | Promise<boolean>;
}): JSX.Element {
  const { t } = useLingui();
  const switching = useContext(CollectionSwitchingContext);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = (
    <>
      <CollectionIcon />
      <span className="sr-only">
        <Trans>Collection: </Trans>
      </span>
      <span className="collection-context-name">{name}</span>
    </>
  );
  if (!switching) {
    return (
      <span className="collection-context" title={t`Collection: ${name}`}>
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
  const choose = async (id: string): Promise<void> => {
    if (id === switching.collectionId) {
      close(true);
      return;
    }
    // Unsaved edits can keep Reader here; the menu stays open for another choice.
    if (!(await beforeSwitch())) {
      return;
    }
    setError(null);
    try {
      switching.select(id);
      close(false);
    } catch (reason) {
      setError(
        readerErrorMessage(reason, translate({ message: "Reader could not switch collections." })),
      );
    }
  };
  const connect = async (): Promise<void> => {
    if (!(await beforeSwitch())) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await switching.connect();
      close(false);
    } catch (reason) {
      setError(
        readerErrorMessage(
          reason,
          translate({ message: "Reader could not connect another collection." }),
        ),
      );
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
        aria-label={t`Switch collection: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t({ message: "Switch collection", context: "CollectionPicker interface" })}
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
          onChoose={(id) => void choose(id)}
          onConnect={() => void connect()}
          onClose={close}
        />
      ) : null}
    </>
  );
}
