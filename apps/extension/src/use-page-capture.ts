import { useCallback, useEffect, useRef, useState } from "react";

import { intentKey, type CaptureIntent } from "./messages.js";
import {
  captureTab,
  readSelection,
  unwatchTabSelection,
  watchTabSelection,
  type PageCapture,
} from "./page-capture.js";
import { pageStatusEnabled, pageStatusOrigins } from "./page-status.js";
import { useLoadedPosts } from "./use-loaded-posts.js";
import { usePageEvents } from "./use-page-events.js";

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
  readonly setSelection: (selection: QuoteSelector | null, postId?: string) => void;
}

/**
 * Keeps the panel attached to the tab it shows: reads the page, then follows new selections
 * without re-reading the document, and reads each new page the tab loads. Reading rests on
 * Reader's site access; where the reader has limited it (or on plain HTTP), the toolbar
 * button grants `activeTab` for the page instead.
 */
export function usePageCapture(tabId: number, onProblem: (message: string) => void): PageLink {
  const [capture, setCapture] = useState<PageCapture | null>(null);
  useLoadedPosts(tabId, setCapture);
  const [navigated, setNavigated] = useState(false);
  const [following, setFollowing] = useState(false);
  const readingEpoch = useRef(0);
  // Invalidate pending public-API captures when leaving the tab/panel.
  useEffect(
    () => () => {
      ++readingEpoch.current;
      unwatchTabSelection(tabId);
    },
    [tabId],
  );
  const [invocation, setInvocation] = useState<PageLink["invocation"]>(null);
  const problem = useRef(onProblem);
  useEffect(() => {
    problem.current = onProblem;
  }, [onProblem]);

  const setSelection = useCallback((selection: QuoteSelector | null, postId?: string) => {
    setCapture((current) =>
      current?.kind === "html"
        ? { ...current, selection, ...(postId ? { selectionPostId: postId } : {}) }
        : current,
    );
  }, []);
  const readPage = useCallback(async (): Promise<PageCapture> => {
    const epoch = ++readingEpoch.current;
    const value = await captureTab(tabId);
    if (epoch !== readingEpoch.current) {
      return value;
    }
    setCapture(value);
    setNavigated(false);
    setFollowing(false);
    if (value.kind === "html") {
      await watchTabSelection(tabId).catch(() => undefined);
    }
    return value;
  }, [tabId]);
  const { siteAccess, allowAllSites } = useSiteAccess(readPage);
  const followSelection = useCallback(async () => {
    const epoch = ++readingEpoch.current;
    if (capture?.kind === "html" && capture.social) {
      const next = await captureTab(tabId);
      if (epoch === readingEpoch.current) {
        setCapture(next);
      }
      return;
    }
    const selection = await readSelection(tabId);
    if (selection && epoch === readingEpoch.current) {
      setSelection(selection);
    }
  }, [capture, setSelection, tabId]);

  usePageEvents({
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
  });

  useInitialIntent(tabId, setInvocation);

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

function useSiteAccess(
  readPage: PageLink["readPage"],
): Pick<PageLink, "siteAccess" | "allowAllSites"> {
  const [siteAccess, setSiteAccess] = useState<boolean | null>(null);
  useEffect(() => {
    const check = (): void => {
      void pageStatusEnabled()
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
  const allowAllSites = useCallback(async (): Promise<boolean> => {
    const granted = await chrome.permissions.request({ origins: pageStatusOrigins });
    if (granted) {
      await readPage();
    }
    return granted;
  }, [readPage]);
  return { siteAccess, allowAllSites };
}

function useInitialIntent(
  tabId: number,
  setInvocation: (value: PageLink["invocation"]) => void,
): void {
  useEffect(() => {
    const key = intentKey(tabId);
    void chrome.storage.session
      .get(key)
      .then(async ({ [key]: intent }) => {
        if (intent === "highlight" || intent === "note") {
          setInvocation({ intent, at: Date.now() });
        }
        await chrome.storage.session.remove(key);
      })
      .catch(() => undefined);
  }, [setInvocation, tabId]);
}
