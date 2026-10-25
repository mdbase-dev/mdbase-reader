import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { expect, it, vi } from "vitest";

import { createPdfPageNavigation } from "./pdf-page-navigation.js";

import type { PluginRegistry, ScrollPlugin } from "@embedpdf/react-pdf-viewer";

function fixture(): {
  readonly registry: PluginRegistry;
  readonly scroll: Pick<ReturnType<ScrollPlugin["provides"]>, "onLayoutReady" | "scrollToPage">;
  readonly scrollToPage: ReturnType<typeof vi.fn>;
  layout(): void;
} {
  const events = createEventEmitter<{
    documentId: string;
    isInitial: boolean;
    pageNumber: number;
    totalPages: number;
  }>();
  const scrollToPage = vi.fn();
  return {
    registry: {} as PluginRegistry,
    scroll: { scrollToPage, onLayoutReady: events.subscribe },
    scrollToPage,
    layout: () =>
      events.emit({ documentId: "book", isInitial: true, pageNumber: 1, totalPages: 24 }),
  };
}

it("waits for the actual PDF layout before an absolute chapter-start jump", async () => {
  const value = fixture();
  const navigation = createPdfPageNavigation(value.registry, value.scroll, () => Promise.resolve());
  const jump = navigation.goToPage(10);
  await Promise.resolve();
  expect(value.scrollToPage).not.toHaveBeenCalled();
  value.layout();
  await jump;
  expect(value.scrollToPage).toHaveBeenCalledExactlyOnceWith({
    pageNumber: 11,
    behavior: "instant",
  });
  navigation.destroy();
});

it("does not wait for a second initial layout when a runtime is reattached to its own registry", async () => {
  const value = fixture();
  const first = createPdfPageNavigation(value.registry, value.scroll, () => Promise.resolve());
  value.layout();
  first.destroy();
  const next = createPdfPageNavigation(value.registry, value.scroll, () => Promise.resolve());
  await next.goToPage(15);
  expect(value.scrollToPage).toHaveBeenCalledWith({ pageNumber: 16, behavior: "instant" });
  next.destroy();
});

it("releases a pending jump without scrolling a destroyed renderer", async () => {
  const value = fixture();
  const navigation = createPdfPageNavigation(value.registry, value.scroll, () => Promise.resolve());
  const pending = navigation.goToPage(10);
  await Promise.resolve();
  navigation.destroy();
  await pending;
  expect(value.scrollToPage).not.toHaveBeenCalled();
});
