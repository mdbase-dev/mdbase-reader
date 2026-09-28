import { mdbaseAppHref, withAppUrls, type MdbaseApp } from "@mdbase-dev/ui/apps";
import { MdbaseAppMark, Wordmark } from "@mdbase-dev/ui/brand";
import { useId, useRef, useState, type JSX, type RefObject } from "react";

import { moveFocus, useMenuPlacement } from "./CollectionMenu.js";
import { ChevronDownIcon, OpenExternalIcon } from "./icons.js";

import "./collection-picker.css";
import "./app-switcher.css";

/** Local builds point the menu at local copies of the other apps. */
const apps = withAppUrls({
  editor: import.meta.env.VITE_MDBASE_EDITOR_URL,
  reader: import.meta.env.VITE_MDBASE_READER_URL,
  writer: import.meta.env.VITE_MDBASE_WRITER_URL,
});

/**
 * The header's product brand, which opens a menu for opening this collection in the other
 * mdbase apps. Each opens in a new tab so Reader stays where it is.
 */
export function AppSwitcher(): JSX.Element {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus();
    }
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="app-switcher-trigger"
        aria-label="mdbase reader: open this collection in another app"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Open in another mdbase app"
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Wordmark app="reader" />
        <ChevronDownIcon className="app-switcher-chevron" aria-hidden="true" />
      </button>
      {open ? <AppMenu id={menuId} triggerRef={triggerRef} onClose={close} /> : null}
    </>
  );
}

function AppMenu({
  id,
  triggerRef,
  onClose,
}: {
  readonly id: string;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: (refocus: boolean) => void;
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuPlacement(menuRef, triggerRef, onClose, false);
  const hasCollection = new URL(location.href).searchParams.has("collection");
  return (
    <div
      ref={menuRef}
      id={id}
      className="collection-menu app-menu"
      popover="manual"
      role="menu"
      aria-label={hasCollection ? "Open this collection in" : "mdbase apps"}
      tabIndex={-1}
      onKeyDown={(event) => moveFocus(event, menuRef.current)}
    >
      <div className="collection-menu-heading" role="presentation">
        {hasCollection ? "Open this collection in" : "mdbase apps"}
      </div>
      <div className="collection-menu-list">
        {apps.map((app) => (
          <AppItem key={app.id} app={app} onOpen={() => onClose(false)} />
        ))}
      </div>
      <p className="app-menu-note">Opens in a new tab</p>
    </div>
  );
}

function AppItem({
  app,
  onOpen,
}: {
  readonly app: MdbaseApp;
  readonly onOpen: () => void;
}): JSX.Element {
  const copy = (
    <>
      <MdbaseAppMark app={app.id} className="app-menu-mark" />
      <span className="collection-menu-copy">
        <strong>{app.name}</strong>
        <small>{app.description}</small>
      </span>
    </>
  );
  if (app.id === "reader") {
    return (
      <div
        className="collection-menu-item app-menu-item is-current"
        role="menuitem"
        aria-current="page"
        aria-disabled="true"
        tabIndex={-1}
      >
        {copy}
        <span className="app-menu-current">Current</span>
      </div>
    );
  }
  return (
    <a
      className="collection-menu-item app-menu-item"
      role="menuitem"
      href={mdbaseAppHref(app.url, location.href)}
      target="_blank"
      rel="noopener"
      onClick={onOpen}
    >
      {copy}
      <OpenExternalIcon className="app-menu-external" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
