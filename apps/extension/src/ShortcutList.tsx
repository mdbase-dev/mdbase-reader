import { Trans } from "@lingui/react/macro";

import { openShortcutSettings, useShortcuts } from "./shortcuts.js";

/** The extension's keyboard shortcuts as currently bound, and where to change them. */
export function ShortcutList(): React.JSX.Element {
  const shortcuts = useShortcuts();
  return (
    <>
      <dl className="shortcuts">
        {shortcuts?.map((shortcut) => (
          <div key={shortcut.name}>
            <dt>{shortcut.description}</dt>
            <dd>
              {shortcut.keys ? (
                <kbd>{shortcut.keys}</kbd>
              ) : (
                <span>
                  <Trans>Not set</Trans>
                </span>
              )}
            </dd>
          </div>
        ))}
        <div>
          <dt>
            <Trans>Highlight selected text, with or without a comment</Trans>
          </dt>
          <dd>
            <span>
              <Trans>Right-click the selection</Trans>
            </span>
          </dd>
        </div>
      </dl>
      <button type="button" className="text-button" onClick={openShortcutSettings}>
        <Trans>Change keyboard shortcuts</Trans>
      </button>
    </>
  );
}
