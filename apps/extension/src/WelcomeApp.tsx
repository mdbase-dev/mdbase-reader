import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

import { CollectionSection } from "./CollectionSection.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { openSettings, useShortcuts } from "./shortcuts.js";
import { useCollectionConnection } from "./use-collection-connection.js";

/** Opened once, when the extension is first installed. */
export function WelcomeApp(): React.JSX.Element {
  const { t } = useLingui();
  const connection = useCollectionConnection();
  const snapshot = connection.snapshot;
  const shortcuts = useShortcuts();
  const keys = (name: string): string | null =>
    shortcuts?.find((shortcut) => shortcut.name === name)?.keys ?? null;
  const open = keys("_execute_action");
  const highlight = keys("save-highlight");
  useEffect(() => {
    document.title = t`Welcome to mdbase Reader`;
  }, [t]);
  return (
    <div className="extension-page">
      <ExtensionHeader collectionId={snapshot.status === "ready" ? snapshot.collectionId : null} />
      <main>
        <h1>
          <Trans>mdbase Reader is installed</Trans>
        </h1>
        <p className="lede">
          <Trans>
            Save articles and PDFs to your mdbase collection as you read, highlight passages, and
            find them again in Reader.
          </Trans>
        </p>
        <ol className="steps">
          <li>
            <h2>
              <Trans>Connect a collection</Trans>
            </h2>
            <CollectionSection connection={connection} label={t`Save to collection`} />
          </li>
          <li>
            <h2>
              <Trans>Pin the extension</Trans>
            </h2>
            <p>
              <Trans>
                Open Chrome’s extensions menu (the puzzle piece beside the address bar) and pin
                mdbase Reader so its button stays in the toolbar.
              </Trans>
            </p>
          </li>
          <li>
            <h2>
              <Trans>Save what you are reading</Trans>
            </h2>
            <p>
              {open ? (
                <Trans>
                  On any page, press the toolbar button or <kbd>{open}</kbd>.
                </Trans>
              ) : (
                <Trans>On any page, press the toolbar button.</Trans>
              )}{" "}
              <Trans>
                A side panel opens where you can check the title and citation, add tags and a note,
                and save. It stays open as you move between tabs and pages, showing whatever you are
                reading.
              </Trans>
            </p>
          </li>
          <li>
            <h2>
              <Trans>Highlight passages</Trans>
            </h2>
            <p>
              <Trans>
                With the panel open, select text on the page and it appears there. Choose a colour
                to save it, adding a comment first if you like.
              </Trans>{" "}
              {highlight ? (
                <Trans>
                  To save a selection straight away, right-click it and choose Save highlight, or
                  press <kbd>{highlight}</kbd>.
                </Trans>
              ) : (
                <Trans>
                  To save a selection straight away, right-click it and choose Save highlight.
                </Trans>
              )}{" "}
              <Trans>
                Pages you have saved are marked on the toolbar button and show your highlights.
              </Trans>
            </p>
          </li>
        </ol>
        <p className="hint">
          <Trans>
            You can change the collection and shortcuts at any time in{" "}
            <button type="button" className="inline-link" onClick={openSettings}>
              Settings
            </button>
            .
          </Trans>
        </p>
      </main>
    </div>
  );
}
