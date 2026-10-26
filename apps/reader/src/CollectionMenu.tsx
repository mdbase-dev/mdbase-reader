import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { moveMenuFocus, useMenuPopover } from "@mdbase-dev/ui/popover";
import { useRef, useState, type CSSProperties, type JSX, type RefObject } from "react";

import {
  hueOf,
  initials,
  locationLabel,
  orderedChoices,
  type CollectionChoice,
} from "./collection-menu-model.js";
import { CheckIcon, PlusIcon } from "./icons.js";

/** Collections worth a filter box; fewer fit at a glance. */
const filterThreshold = 7;

/**
 * The collection switcher's menu, dropped from its header trigger. It opens in the top layer
 * where supported, lists the current collection first, and closes on an outside pointer,
 * Escape (returning focus to the trigger), Tab or a resize.
 */
export function CollectionMenu({
  id,
  triggerRef,
  currentId,
  currentName,
  choices,
  busy,
  error,
  onChoose,
  onConnect,
  onClose,
}: {
  readonly id: string;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly currentId: string;
  readonly currentName: string;
  readonly choices: readonly CollectionChoice[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onChoose: (collectionId: string) => void;
  readonly onConnect: () => void;
  readonly onClose: (refocus: boolean) => void;
}): JSX.Element {
  const { t } = useLingui();
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  useMenuPopover(menuRef, triggerRef, onClose, { width: 320, busy });
  const ordered = orderedChoices(choices, currentId, currentName);
  const visible = query.trim()
    ? ordered.filter(({ displayName }) =>
        displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : ordered;
  return (
    <div
      ref={menuRef}
      id={id}
      className="collection-menu"
      popover="manual"
      role="menu"
      aria-label={t({ message: "Switch collection", context: "CollectionMenu interface" })}
      tabIndex={-1}
      onKeyDown={(event) => moveMenuFocus(event, menuRef.current)}
    >
      <div className="collection-menu-heading" role="presentation">
        <Trans>Collections</Trans>
      </div>
      {ordered.length >= filterThreshold ? (
        <input
          className="collection-menu-filter"
          type="search"
          aria-label={t({ message: "Filter collections", context: "CollectionMenu interface" })}
          placeholder={t({ message: "Filter collections", context: "CollectionMenu interface" })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div
        className="collection-menu-list"
        role="group"
        aria-label={t({ message: "Connected collections", context: "CollectionMenu interface" })}
      >
        {visible.map((choice) => (
          <CollectionItem
            key={choice.collectionId}
            choice={choice}
            current={choice.collectionId === currentId}
            disabled={busy}
            onChoose={onChoose}
          />
        ))}
        {visible.length === 0 ? (
          <p className="collection-menu-empty">{t`No collections match “${query.trim()}”.`}</p>
        ) : null}
      </div>
      {error ? (
        <p className="collection-menu-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="collection-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="collection-menu-connect"
        disabled={busy}
        onClick={onConnect}
      >
        <PlusIcon />
        <span>
          {busy
            ? t({ message: "Opening mdbase…", context: "CollectionMenu interface" })
            : t({ message: "Connect another collection…" })}
        </span>
      </button>
    </div>
  );
}

function CollectionItem({
  choice,
  current,
  disabled,
  onChoose,
}: {
  readonly choice: CollectionChoice;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly onChoose: (collectionId: string) => void;
}): JSX.Element {
  useLocale();
  const place = locationLabel(choice);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={current}
      className="collection-menu-item"
      disabled={disabled}
      onClick={() => onChoose(choice.collectionId)}
    >
      <span
        className="collection-menu-mark"
        aria-hidden="true"
        style={{ "--hue": hueOf(choice.collectionId) } as CSSProperties}
      >
        {initials(choice.displayName)}
      </span>
      <span className="collection-menu-copy">
        <strong>{choice.displayName}</strong>
        {place || current ? (
          <small>
            {[
              current
                ? translate({ message: "Open now", context: "CollectionMenu status or action" })
                : null,
              place,
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
        ) : null}
      </span>
      {current ? <CheckIcon className="collection-menu-check" aria-hidden="true" /> : null}
    </button>
  );
}
