import { themePreferences, type ThemePreference } from "@mdbase-reader/ui";
import { useEffect } from "react";

import { readerLibraryUrl } from "./capture-model.js";
import { CollectionSection } from "./CollectionSection.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { environment } from "./environment.js";
import { useThemePreference } from "./extension-theme.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { PageStatusSetting } from "./PageStatusSetting.js";
import { ShortcutList } from "./ShortcutList.js";
import { useCollectionConnection } from "./use-collection-connection.js";

export function OptionsApp(): React.JSX.Element {
  const connection = useCollectionConnection();
  const snapshot = connection.snapshot;
  const collectionId = "collectionId" in snapshot ? snapshot.collectionId : null;
  useEffect(() => {
    document.title = "mdbase Reader settings";
  }, []);
  return (
    <div className="extension-page">
      <ExtensionHeader collectionId={collectionId} />
      <main>
        <h1>Settings</h1>
        <section aria-labelledby="collection-heading">
          <h2 id="collection-heading">Collection</h2>
          <CollectionSection connection={connection} label="Save new sources to" />
        </section>
        <section aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">Appearance</h2>
          <ThemeSetting />
        </section>
        <section aria-labelledby="page-status-heading">
          <h2 id="page-status-heading">Saved pages</h2>
          <PageStatusSetting />
        </section>
        <section aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading">Keyboard shortcuts</h2>
          <ShortcutList />
        </section>
        <section aria-labelledby="troubleshooting-heading">
          <h2 id="troubleshooting-heading">Troubleshooting</h2>
          <DiagnosticsSetting />
        </section>
        <section aria-labelledby="about-heading">
          <h2 id="about-heading">About</h2>
          <About collectionId={collectionId} />
        </section>
      </main>
    </div>
  );
}

function DiagnosticsSetting(): React.JSX.Element {
  const [shown, setShown] = useDiagnosticsShown();
  return (
    <>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={shown}
          onChange={(event) => setShown(event.target.checked)}
        />
        Show connection diagnostics in the side panel
      </label>
      <p className="hint">
        For reporting slow or failed saves. The panel can then record connection timings and
        download them; nothing is recorded until you start it there.
      </p>
    </>
  );
}

function ThemeSetting(): React.JSX.Element {
  const [theme, setTheme] = useThemePreference();
  return (
    <>
      <fieldset className="choice-group">
        <legend className="visually-hidden">Theme</legend>
        {themePreferences.map((value) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
            />
            {themeLabels[value]}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        For the side panel, this page and the welcome page. Reader keeps its own theme setting.
      </p>
    </>
  );
}

const themeLabels: Record<ThemePreference, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

function About({ collectionId }: { readonly collectionId: string | null }): React.JSX.Element {
  const { version_name: name, version } = chrome.runtime.getManifest();
  return (
    <>
      <p className="hint">
        mdbase Reader {name ?? version}
        {environment.label ? ` · ${environment.label}` : ""}. Pages and highlights are saved into
        your mdbase collection through mdbase Connect.
      </p>
      <a
        className="text-button"
        href={readerLibraryUrl(collectionId)}
        target="_blank"
        rel="noreferrer"
      >
        Open mdbase Reader
      </a>
    </>
  );
}
