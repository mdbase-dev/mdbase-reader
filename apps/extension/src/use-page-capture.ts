import { useCallback, useEffect, useRef, useState } from "react";

import { intentKey, isExtensionMessage, type CaptureIntent } from "./messages.js";
import {
  captureTab,
  readSelection,
  unwatchTabSelection,
  watchTabSelection,
  type PageCapture,
} from "./page-capture.js";
import { pageStatusEnabled, pageStatusOrigins } from "./page-status.js";

import type { QuoteSelector } from "@mdbase-reader/core";

export interface PageLink {
  readonly capture: PageCapture | null;
  /** The tab left the captured page. */
  readonly navigated: boolean;
  /** The panel is reading the tab's new page by itself; nothing to ask. */
  readonly following: boolean;
  /** Changes each time the reader invokes the extension, so the panel can focus the right field. */
  readonly invocation: { readonly intent: CaptureIntent; readonly at: number } | null;
  readonly readPage: () => Promise<PageCapture>;
  /** False when the reader has limited Reader's site access in Chrome; null until known. */
  readonly siteAccess: boolean | null;
  /**
   * Asks Chrome for access to every HTTPS site again, then reads the page. Call it straight
   * from a click: Chrome asks only during a user gesture.
   */
  readonly allowAllSites: () => Promise<boolean>;
  readonly setSelection: (selection: QuoteSelector | null) => void;
}

/**
 * Keeps the panel attached to the tab it shows: reads the page, then follows new selections
 * without re-reading the document, and reads each new page the tab loads. Reading rests on
 * Reader's site access; where the reader has limited it (or on plain HTTP), the toolbar
 * button grants `activeTab` for the page instead.
 */
export function usePageCapture(tabId: number, onProblem: (message: string) => void): PageLink {
  const [capture, setCapture] = useState<PageCapture | null>(null);
  const [navigated, setNavigated] = useState(false);
  const [following, setFollowing] = useState(false);
  // The page reports selections only while a panel shows its tab.
  useEffect(() => () => unwatchTabSelection(tabId), [tabId]);
  const [siteAccess, setSiteAccess] = useState<boolean | null>(null);
  useEffect(() => {
    const check = (): void => {
      pageStatusEnabled()
        .then(setSiteAccess)
        .catch(() => setSiteAccess(false));
    };
    check();
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    return () => {
      chrome.permissions.onAdded.removeListener(check);
      chrome.permissions.onRemoved.removeListener(check);
    };
  }, []);
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
        // A new invocation grants activeTab, so a page not read yet can be read now.
        // The intent counts once the selection it refers to has been read.
        (navigated || !capture ? readPage() : followSelection())
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
        setFollowing(true);
      }
      if (change.status === "complete" && navigated && following) {
        // A page Reader cannot read leaves the panel waiting for the toolbar button.
        readPage().catch(() => setFollowing(false));
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [capture, followSelection, following, navigated, readPage, tabId]);

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

  const allowAllSites = useCallback(async (): Promise<boolean> => {
    // The request comes first, while the click still counts as a user gesture.
    const granted = await chrome.permissions.request({ origins: pageStatusOrigins });
    if (granted) {
      await readPage();
    }
    return granted;
  }, [readPage]);

  return {
    capture,
    navigated,
    following,
    invocation,
    readPage,
    siteAccess,
    allowAllSites,
    setSelection,
  };
}
