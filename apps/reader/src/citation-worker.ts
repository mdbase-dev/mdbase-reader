import {
  prepareCitationEngine,
  renderCitation,
  type CitationItem,
} from "@mdbase-reader/ui/citation";

const ready = prepareCitationEngine();
globalThis.addEventListener(
  "message",
  (
    event: MessageEvent<{
      readonly id: number;
      readonly citation: CitationItem;
      readonly style: string;
      readonly locale: string;
    }>,
  ) => {
    const { id, citation, style, locale } = event.data;
    void ready
      .then(() => renderCitation(citation, style, locale))
      .then(
        (rendered) => globalThis.postMessage({ id, rendered }),
        () => globalThis.postMessage({ id, rendered: { kind: "failed" } }),
      );
  },
);
void ready.catch(() => undefined);
