import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { PageCapture } from "./page-capture.js";

/** Keep the picker current as virtualised feeds load/replace posts, without re-extracting. */
export function useLoadedPosts(
  tabId: number,
  setCapture: Dispatch<SetStateAction<PageCapture | null>>,
): void {
  useEffect(() => {
    const changed = (message: unknown, sender: chrome.runtime.MessageSender): void => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "mdbase-reader/posts-changed" ||
        sender.tab?.id !== tabId
      ) {
        return;
      }
      void chrome.scripting
        .executeScript({
          target: { tabId },
          func: async () => globalThis.mdbaseReaderSocialPage?.refreshItems() ?? null,
        })
        .then(([result]) => {
          const listing = result?.result;
          if (listing) {
            setCapture((current) =>
              current?.kind === "html" && current.social
                ? { ...current, social: listing }
                : current,
            );
          }
        })
        .catch(() => undefined);
    };
    chrome.runtime.onMessage.addListener(changed);
    return () => chrome.runtime.onMessage.removeListener(changed);
  }, [tabId, setCapture]);
}
