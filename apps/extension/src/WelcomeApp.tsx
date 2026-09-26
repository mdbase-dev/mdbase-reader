import { useEffect } from "react";

import { CollectionSection } from "./CollectionSection.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { openSettings, useShortcuts } from "./shortcuts.js";
import { useCollectionConnection } from "./use-collection-connection.js";

/** Opened once, when the extension is first installed. */
export function WelcomeApp(): React.JSX.Element {
  const connection = useCollectionConnection();
  const snapshot = connection.snapshot;
  const shortcuts = useShortcuts();
  const keys = (name: string): string | null =>
    shortcuts?.find((shortcut) => shortcut.name === name)?.keys ?? null;
  const open = keys("_execute_action");
  const highlight = keys("save-highlight");
  useEffect(() => {
    document.title = "Welcome to mdbase Reader";
  }, []);
  return (
    <div className="extension-page">
      <ExtensionHeader collectionId={"collectionId" in snapshot ? snapshot.collectionId : null} />
      <main>
        <h1>mdbase Reader is installed</h1>
        <p className="lede">
          Save articles and PDFs to your mdbase collection as you read, highlight passages, and find
          them again in Reader.
        </p>
        <ol className="steps">
          <li>
            <h2>Connect a collection</h2>
            <CollectionSection connection={connection} label="Save to collection" />
          </li>
          <li>
            <h2>Pin the extension</h2>
            <p>
              Open Chrome’s extensions menu (the puzzle piece beside the address bar) and pin mdbase
              Reader so its button stays in the toolbar.
            </p>
          </li>
          <li>
            <h2>Save what you are reading</h2>
            <p>
              On any page, press the toolbar button
              {open ? (
                <>
                  {" "}
                  or <kbd>{open}</kbd>
                </>
              ) : null}
              . A side panel opens where you can check the title and citation, add tags and a note,
              and save.
            </p>
          </li>
          <li>
            <h2>Highlight passages</h2>
            <p>
              With the panel open, select text on the page and it appears there. Choose a colour to
              save it, adding a comment first if you like. To save a selection straight away,
              right-click it and choose Save highlight
              {highlight ? (
                <>
                  , or press <kbd>{highlight}</kbd>
                </>
              ) : null}
              . Your highlights show on the page whenever you open the panel there.
            </p>
          </li>
        </ol>
        <p className="hint">
          You can change the collection, shortcuts and saved-page marks at any time in{" "}
          <button type="button" className="inline-link" onClick={openSettings}>
            Settings
          </button>
          .
        </p>
      </main>
    </div>
  );
}
