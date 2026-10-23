import { Trans, useLingui } from "@lingui/react/macro";
import { LanguagePicker, LocaleProvider } from "@mdbase-dev/i18n/react";
import { useCallback, useEffect, useId, useState } from "react";

import { readerI18n } from "./runtime.js";

import type { I18nRuntime } from "@mdbase-dev/i18n";
import type { JSX, ReactNode } from "react";

export function ReaderI18nProvider({
  children,
  runtime = readerI18n,
}: {
  readonly children: ReactNode;
  readonly runtime?: I18nRuntime;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  return (
    <LocaleProvider runtime={runtime} onError={onError}>
      <NativeLocaleBridge />
      {failed ? <LanguageLoadNotice /> : null}
      {children}
    </LocaleProvider>
  );
}

/** Optional, narrow Electron preload API; native dialogs follow the renderer choice. */
function NativeLocaleBridge(): null {
  const { i18n } = useLingui();
  useEffect(() => {
    const bridge = (
      globalThis as { mdbaseReader?: { setLocale?: (locale: string) => Promise<void> } }
    ).mdbaseReader;
    void bridge?.setLocale?.(i18n.locale).catch(() => undefined);
  }, [i18n, i18n.locale]);
  return null;
}

function LanguageLoadNotice(): JSX.Element {
  return (
    <p className="reader-language-notice" role="alert">
      <Trans>The language could not be loaded. Your current language is unchanged.</Trans>
    </p>
  );
}

/** The kit supplies endonyms, pending state and accessible native-select behavior. */
export function ReaderLanguageSetting(): JSX.Element {
  const { t } = useLingui();
  const id = useId();
  const [failed, setFailed] = useState(false);
  return (
    <div className="display-choice reader-language-setting" data-menu-keep-open>
      <label htmlFor={id}>
        {t({ message: "Language", context: "interface language setting" })}
      </label>
      <LanguagePicker
        id={id}
        className="mdbase-field reader-language-picker"
        label={t({ message: "Language", context: "interface language setting" })}
        onError={() => setFailed(true)}
        onFocus={() => setFailed(false)}
      />
      {failed ? <LanguageLoadNotice /> : null}
    </div>
  );
}
