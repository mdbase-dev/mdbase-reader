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
            <dd>{shortcut.keys ? <kbd>{shortcut.keys}</kbd> : <span>Not set</span>}</dd>
          </div>
        ))}
        <div>
          <dt>Highlight selected text, with or without a comment</dt>
          <dd>
            <span>Right-click the selection</span>
          </dd>
        </div>
      </dl>
      <button type="button" className="text-button" onClick={openShortcutSettings}>
        Change keyboard shortcuts
      </button>
    </>
  );
}
