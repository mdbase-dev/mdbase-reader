import { useEffect, type RefObject } from "react";

import { intentKey, isExtensionMessage, type CaptureIntent } from "./messages.js";

import type { PageCapture } from "./page-capture.js";

interface PageEvents {
  readonly tabId: number;
  readonly capture: PageCapture | null;
  readonly navigated: boolean;
  readonly following: boolean;
  readonly readPage: () => Promise<PageCapture | null>;
  readonly followSelection: () => Promise<void>;
  readonly setNavigated: (value: boolean) => void;
  readonly setFollowing: (value: boolean) => void;
  readonly setInvocation: (value: { intent: CaptureIntent; at: number }) => void;
  readonly readingEpoch: RefObject<number>;
  readonly problem: RefObject<(message: string) => void>;
}

/** Follows full and same-document navigation; stale captures cannot trigger a quick save. */
export function usePageEvents({
  tabId,
  capture,
  navigated,
  following,
  readPage,
  followSelection,
  setNavigated,
  setFollowing,
  setInvocation,
  readingEpoch,
  problem,
}: PageEvents): void {
  useEffect(() => {
    const onMessage = (message: unknown, sender: chrome.runtime.MessageSender): void => {
      if (!isExtensionMessage(message)) {
        return;
      }
      if (
        message.type === "mdbase-reader/posts-changed" &&
        sender.tab?.id === tabId &&
        navigated &&
        !following
      ) {
        setFollowing(true);
        void readPage().catch(() => setFollowing(false));
      }
      if (message.type === "mdbase-reader/selection" && sender.tab?.id === tabId) {
        void followSelection().catch(() => undefined);
      }
      if (message.type === "mdbase-reader/invoke" && message.tabId === tabId) {
        const { intent } = message;
        void chrome.storage.session.remove(intentKey(tabId)).catch(() => undefined);
        const reading = navigated || !capture ? readPage() : followSelection();
        const epoch = readingEpoch.current;
        void reading
          .then(() => {
            if (epoch === readingEpoch.current) {
              setInvocation({ intent, at: Date.now() });
            }
          })
          .catch((reason: unknown) =>
            problem.current(reason instanceof Error ? reason.message : String(reason)),
          );
      }
    };
    const onUpdated = (
      updatedTab: number,
      change: { readonly status?: string; readonly url?: string },
    ): void => {
      if (updatedTab !== tabId) {
        return;
      }
      const capturedUrl =
        capture?.kind === "html"
          ? (capture.pageUrl ?? capture.submittedUrl)
          : capture?.submittedUrl;
      if (change.url && change.status !== "loading" && change.url !== capturedUrl) {
        setNavigated(true);
        setFollowing(true);
        void readPage().catch(() => setFollowing(false));
      }
      if (change.status === "loading") {
        ++readingEpoch.current;
        setNavigated(true);
        setFollowing(true);
      }
      if (change.status === "complete" && navigated && following) {
        void readPage().catch(() => setFollowing(false));
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [
    capture,
    followSelection,
    following,
    navigated,
    readPage,
    tabId,
    problem,
    readingEpoch,
    setFollowing,
    setInvocation,
    setNavigated,
  ]);
}
