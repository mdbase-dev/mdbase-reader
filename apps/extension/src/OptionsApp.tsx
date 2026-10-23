import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { themePreferences, type ThemePreference } from "@mdbase-dev/ui/theme";
import { ReaderLanguageSetting } from "@mdbase-reader/i18n/react";
import { useEffect } from "react";

import { readerLibraryUrl } from "./capture-model.js";
import { CollectionSection } from "./CollectionSection.js";
import { useDiagnosticsShown } from "./diagnostics-setting.js";
import { environment } from "./environment.js";
import { useThemePreference } from "./extension-theme.js";
import { ExtensionHeader } from "./ExtensionHeader.js";
import { ShortcutList } from "./ShortcutList.js";
import { SiteAccessStatus } from "./SiteAccessStatus.js";
import { useCollectionConnection } from "./use-collection-connection.js";

import type { MessageDescriptor } from "@lingui/core";

export function OptionsApp(): React.JSX.Element {
  const { t } = useLingui();
  const connection = useCollectionConnection();
  const snapshot = connection.snapshot;
  const collectionId = snapshot.status === "ready" ? snapshot.collectionId : null;
  useEffect(() => {
    document.title = t`mdbase Reader settings`;
  }, [t]);
  return (
    <div className="extension-page">
      <ExtensionHeader collectionId={collectionId} />
      <main>
        <h1>
          <Trans>Settings</Trans>
        </h1>
        <section aria-labelledby="collection-heading">
          <h2 id="collection-heading">
            <Trans>Collection</Trans>
          </h2>
          <CollectionSection connection={connection} label={t`Save new sources to`} />
        </section>
        <section aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">
            <Trans>Appearance</Trans>
          </h2>
          <ThemeSetting />
          <ReaderLanguageSetting />
        </section>
        <section aria-labelledby="page-status-heading">
          <h2 id="page-status-heading">
            <Trans>Pages you visit</Trans>
          </h2>
          <SiteAccessStatus />
        </section>
        <section aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading">
            <Trans>Keyboard shortcuts</Trans>
          </h2>
          <ShortcutList />
        </section>
        <section aria-labelledby="troubleshooting-heading">
          <h2 id="troubleshooting-heading">
            <Trans>Troubleshooting</Trans>
          </h2>
          <DiagnosticsSetting />
        </section>
        <section aria-labelledby="about-heading">
          <h2 id="about-heading">
            <Trans>About</Trans>
          </h2>
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
        <Trans>
          <input
            type="checkbox"
            checked={shown}
            onChange={(event) => setShown(event.target.checked)}
          />
          Show connection diagnostics in the side panel
        </Trans>
      </label>
      <p className="hint">
        <Trans>
          For reporting slow or failed saves. The panel can then record connection timings and
          download them; nothing is recorded until you start it there.
        </Trans>
      </p>
    </>
  );
}

function ThemeSetting(): React.JSX.Element {
  const { i18n } = useLingui();
  const [theme, setTheme] = useThemePreference();
  return (
    <>
      <fieldset className="choice-group">
        <legend className="visually-hidden">
          <Trans>Theme</Trans>
        </legend>
        {themePreferences.map((value) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
            />
            {i18n._(themeLabels[value])}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        <Trans>
          For the side panel, this page and the welcome page. Reader keeps its own theme setting.
        </Trans>
      </p>
    </>
  );
}

const themeLabels: Record<ThemePreference, MessageDescriptor> = {
  system: msg`Match system`,
  light: msg({ message: "Light", context: "Light appearance theme" }),
  dark: msg({ message: "Dark", context: "Dark appearance theme" }),
};

function About({ collectionId }: { readonly collectionId: string | null }): React.JSX.Element {
  const { version_name: name, version } = chrome.runtime.getManifest();
  return (
    <>
      <p className="hint">
        <Trans>
          mdbase Reader {name ?? version}
          {environment.label ? ` · ${environment.label}` : ""}. Pages and highlights are saved into
          your mdbase collection through mdbase Connect.
        </Trans>
      </p>
      <a
        className="text-button"
        href={readerLibraryUrl(collectionId)}
        target="_blank"
        rel="noreferrer"
      >
        <Trans>Open mdbase Reader</Trans>
      </a>
    </>
  );
}
