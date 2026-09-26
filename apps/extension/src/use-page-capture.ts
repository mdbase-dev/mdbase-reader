import { useCallback, useEffect, useRef, useState } from "react";

import { intentKey, isExtensionMessage, type CaptureIntent } from "./messages.js";
import { captureTab, readSelection, watchTabSelection, type PageCapture } from "./page-capture.js";
import { watchPageStatus } from "./page-status.js";

import type { QuoteSelector } from "@mdbase-reader/core";

export interface PageLink {
  readonly capture: PageCapture | null;
  /** The tab left the captured page; activeTab access ended with it. */
  readonly navigated: boolean;
  /** The panel is reading the tab's new page by itself (page access is on); nothing to ask. */
  readonly following: boolean;
  /** Changes each time the reader invokes the extension, so the panel can focus the right field. */
  readonly invocation: { readonly intent: CaptureIntent; readonly at: number } | null;
  readonly readPage: () => Promise<PageCapture>;
  readonly setSelection: (selection: QuoteSelector | null) => void;
}

/**
 * Keeps the panel attached to its tab: reads the page once, then follows new selections
 * without re-reading the document, and notices when the tab navigates away. With the
 * opt-in page access (Settings → Saved pages) it reads the new page by itself; otherwise
 * `activeTab` ended with the navigation and the reader must invoke the extension again.
 */
export function usePageCapture(tabId: number, onProblem: (message: string) => void): PageLink {
  const [capture, setCapture] = useState<PageCapture | null>(null);
  const [navigated, setNavigated] = useState(false);
  const [following, setFollowing] = useState(false);
  // Known before any navigation, so a new page load never waits on a permission check.
  const followEnabled = useRef(false);
  useEffect(
    () =>
      watchPageStatus((enabled) => {
        followEnabled.current = enabled;
      }),
    [],
  );
  const [invocation, setInvocation] = useState<PageLink["invocation"]>(null);
  const problem = useRef(onProblem);
  useEffect(() => {
    problem.current = onProblem;
  }, [onProblem]);

  const setSelection = useCallback((selection: QuoteSelector | null) => {
    setCapture((current) => (current?.kind === "html" ? { ...current, selection } : current));
  }, []);
  const readPage = useCallback(async (): Promise<PageCapture> => {
    const value = await captureTab(tabId);
    setCapture(value);
    setNavigated(false);
    setFollowing(false);
    if (value.kind === "html") {
      await watchTabSelection(tabId).catch(() => undefined);
    }
    return value;
  }, [tabId]);
  const followSelection = useCallback(async () => {
    const selection = await readSelection(tabId);
    if (selection) {
      setSelection(selection);
    }
  }, [setSelection, tabId]);

  useEffect(() => {
    const onMessage = (message: unknown, sender: chrome.runtime.MessageSender): void => {
      if (!isExtensionMessage(message)) {
        return;
      }
      if (message.type === "mdbase-reader/selection" && sender.tab?.id === tabId) {
        followSelection().catch(() => undefined);
      }
      if (message.type === "mdbase-reader/invoke" && message.tabId === tabId) {
        const { intent } = message;
        void chrome.storage.session.remove(intentKey(tabId)).catch(() => undefined);
        // A new invocation restores activeTab access, so a changed page can be read again.
        // The intent counts once the selection it refers to has been read.
        (navigated ? readPage() : followSelection())
          .then(() => setInvocation({ intent, at: Date.now() }))
          .catch((reason: unknown) =>
            problem.current(reason instanceof Error ? reason.message : String(reason)),
          );
      }
    };
    const onUpdated = (updatedTab: number, change: { readonly status?: string }): void => {
      if (updatedTab !== tabId) {
        return;
      }
      if (change.status === "loading") {
        setNavigated(true);
        setFollowing(followEnabled.current);
      }
      if (change.status === "complete" && navigated && following) {
        // A page Reader cannot read leaves the panel waiting, as without page access.
        readPage().catch(() => setFollowing(false));
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [followSelection, following, navigated, readPage, tabId]);

  useEffect(() => {
    // The intent that opened this panel (e.g. "Highlight with a comment" from the context menu).
    const key = intentKey(tabId);
    chrome.storage.session
      .get(key)
      .then(async ({ [key]: intent }) => {
        if (intent === "highlight" || intent === "note") {
          setInvocation({ intent, at: Date.now() });
        }
        await chrome.storage.session.remove(key);
      })
      .catch(() => undefined);
  }, [tabId]);

  return { capture, navigated, following, invocation, readPage, setSelection };
}
