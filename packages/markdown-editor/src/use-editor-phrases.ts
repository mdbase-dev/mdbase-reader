import { i18n } from "@lingui/core";
import { isLocale } from "@mdbase-dev/i18n";
import { englishCodeMirrorPhrases, loadCodeMirrorPhrases } from "@mdbase-dev/i18n/codemirror";
import { useEffect, useState } from "react";

/** Update the phrase facet without replacing document state, focus or undo history. */
export function useEditorPhrases(): Readonly<Record<string, string>> {
  const [phrases, setPhrases] = useState(englishCodeMirrorPhrases);
  useEffect(() => {
    let generation = 0;
    const activate = (): void => {
      const current = ++generation;
      const locale = isLocale(i18n.locale) ? i18n.locale : "en";
      if (locale === "en") {
        setPhrases(englishCodeMirrorPhrases);
        return;
      }
      void loadCodeMirrorPhrases(locale)
        .then((next) => {
          if (generation === current) {
            setPhrases(next);
          }
        })
        .catch(() => {
          /* Retain the working phrases on a failed local chunk load. */
        });
    };
    const unsubscribe = i18n.on("change", activate);
    activate();
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, []);
  return phrases;
}
