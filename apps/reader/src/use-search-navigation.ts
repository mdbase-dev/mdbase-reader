import { searchDestinationMatchesDocument } from "@mdbase-reader/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { beginExplicitReadingNavigation } from "./reading-navigation-priority.js";
import { annotationDocumentTarget } from "./workspace-annotation-navigation.js";

import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SearchDestination, SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export const searchPassageFallback =
  "The matching passage could not be verified (the file or text may have changed, or the match is ambiguous). The document is open at its usual position. Use its Find control to locate the passage.";

export async function navigateToSearchDestination(
  surface: ReadingSurface,
  destination: SearchDestination,
  signal?: AbortSignal,
): Promise<boolean> {
  surface.capabilities.searchNavigation?.clear();
  if (
    !searchDestinationMatchesDocument(destination, surface.document.document) ||
    !surface.capabilities.searchNavigation
  ) {
    return false;
  }
  await beginExplicitReadingNavigation(surface);
  if (signal?.aborted) {
    return false;
  }
  const previous = surface.currentLocation();
  try {
    const found = await surface.capabilities.searchNavigation.goToDestination(destination);
    if (!found && previous) {
      await surface.goTo(previous);
    }
    return found;
  } catch {
    if (previous) {
      await surface.goTo(previous);
    }
    return false;
  }
}

/** Owns the request outside the library tab, which may unmount as the document opens. */
export function useSearchNavigation(
  workspace: SourceWorkspaceController,
  surfaces: ReadonlyMap<string, ReadingSurface>,
): {
  readonly open: (
    id: SourceId,
    view: "document" | "note" | "annotations",
    destination?: SearchDestination,
  ) => void;
  readonly message: string;
} {
  const [request, setRequest] = useState<{
    sourceId: SourceId;
    destination: SearchDestination;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [messageSource, setMessageSource] = useState<SourceId | null>(null);
  const highlighted = useRef<ReadingSurface | null>(null);
  const open = useCallback(
    (
      id: SourceId,
      view: "document" | "note" | "annotations",
      destination?: SearchDestination,
    ): void => {
      highlighted.current?.capabilities.searchNavigation?.clear();
      highlighted.current = null;
      setMessage("");
      setMessageSource(id);
      setRequest(destination && view === "document" ? { sourceId: id, destination } : null);
      const target = annotationDocumentTarget(workspace.layout, id, workspace.layout.focusedPaneId);
      if (view === "document" && target.tabId) {
        workspace.activateTab(target.tabId, target.paneId);
        workspace.focus(target.paneId);
      } else {
        workspace.openView(id, view);
      }
      if (view === "document" && !destination) {
        setMessage(searchPassageFallback);
      }
    },
    [workspace],
  );
  const active = workspace.activeTab;
  useEffect(() => {
    if (
      !request ||
      active?.kind !== "source" ||
      active.view !== "document" ||
      active.sourceId !== request.sourceId
    ) {
      return undefined;
    }
    const surface = surfaces.get(active.id);
    if (!surface) {
      return undefined;
    }
    let cancelled = false;
    let completed = false;
    const controller = new AbortController();
    void navigateToSearchDestination(surface, request.destination, controller.signal)
      .catch(() => false)
      .then((found) => {
        if (cancelled) {
          return;
        }
        completed = true;
        highlighted.current = found ? surface : null;
        setMessage(
          found
            ? `Matching passage: “${request.destination.quote.exact}”. Temporarily highlighted in the document.`
            : searchPassageFallback,
        );
        setRequest(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (!completed) {
        surface.capabilities.searchNavigation?.clear();
      }
    };
  }, [active, request, surfaces]);
  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      highlighted.current?.capabilities.searchNavigation?.clear();
      highlighted.current = null;
    }, 12_000);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [message]);
  useEffect(() => () => highlighted.current?.capabilities.searchNavigation?.clear(), []);
  const visibleMessage =
    active?.kind === "source" && active.view === "document" && active.sourceId === messageSource
      ? message
      : "";
  return { open, message: visibleMessage };
}
