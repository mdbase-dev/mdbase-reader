import type { PluginRegistry, ScrollPlugin } from "@embedpdf/react-pdf-viewer";

const laidOutRegistries = new WeakSet<PluginRegistry>();

/** Resume only after EmbedPDF has restored its own initial viewport offset. */
export function createPdfPageNavigation(
  registry: PluginRegistry,
  scroll: Pick<ReturnType<ScrollPlugin["provides"]>, "onLayoutReady" | "scrollToPage">,
  documentReady: () => Promise<unknown>,
): { readonly goToPage: (pageIndex: number) => Promise<void>; readonly destroy: () => void } {
  let ready = laidOutRegistries.has(registry);
  let destroyed = false;
  const waiters = new Set<() => void>();
  const release = (): void => {
    waiters.forEach((resolve) => resolve());
    waiters.clear();
  };
  const stop = scroll.onLayoutReady(() => {
    ready = true;
    laidOutRegistries.add(registry);
    release();
  });
  return {
    async goToPage(pageIndex) {
      await documentReady();
      if (!ready && !destroyed) {
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
      if (!destroyed) {
        scroll.scrollToPage({ pageNumber: pageIndex + 1, behavior: "instant" });
      }
    },
    destroy() {
      destroyed = true;
      stop();
      release();
    },
  };
}
