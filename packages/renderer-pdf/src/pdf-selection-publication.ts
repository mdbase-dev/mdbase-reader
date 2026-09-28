import type { FormattedSelection, SelectionCapability } from "@embedpdf/plugin-selection";
import type { EventSource, TextSelectionDraft, Unsubscribe } from "@mdbase-reader/reading-surface";

export type PdfSelectionAdjustment = "start" | "end";

export function textSelectionToDraft(
  textParts: readonly string[],
  formatted: readonly FormattedSelection[],
): TextSelectionDraft | null {
  const exact = textParts.join("\n");
  if (!exact.trim() || formatted.length === 0) {
    return null;
  }
  const first = formatted[0];
  const firstPage = first?.pageIndex ?? 0;
  const pdf =
    formatted.length === 1 && first
      ? {
          pdf: {
            pageIndex: firstPage,
            coordinateSpace: {
              profile: "embedpdf-selection-page-points-v1",
              box: "crop" as const,
              origin: "top_left" as const,
            },
            quadPoints: first.segmentRects.map(rectToQuadPoints),
          },
        }
      : {};
  return { target: { quote: { exact }, ...pdf }, locator: { kind: "pdf", pageIndex: firstPage } };
}

function rectToQuadPoints(
  rect: FormattedSelection["rect"],
): readonly [number, number, number, number, number, number, number, number] {
  const left = rect.origin.x;
  const top = rect.origin.y;
  const right = left + rect.size.width;
  const bottom = top + rect.size.height;
  return [left, top, right, top, left, bottom, right, bottom];
}

/** Programmatic range changes don't emit EmbedPDF's onEndSelection. Also discard late text
 * reads: a cleared/replaced selection must never resurrect an old highlight draft. */
export function observePdfSelection(
  selection: Pick<
    SelectionCapability,
    "getFormattedSelection" | "getSelectedText" | "onSelectionChange" | "onEndSelection"
  >,
  listener: (draft: TextSelectionDraft) => void,
  adjustments?: EventSource<PdfSelectionAdjustment>,
): Unsubscribe {
  let generation = 0;
  const publish = (): void => {
    const current = ++generation;
    const formatted = selection.getFormattedSelection();
    if (!formatted.length) {
      return;
    }
    void selection
      .getSelectedText()
      .toPromise()
      .then((parts) => {
        if (current !== generation) {
          return;
        }
        const draft = textSelectionToDraft(parts, formatted);
        if (draft) {
          listener(draft);
        }
      })
      .catch(() => {
        /* A closing document can cancel the engine task. */
      });
  };
  const stops = [
    selection.onSelectionChange(() => {
      generation++;
    }),
    selection.onEndSelection(publish),
    adjustments?.subscribe((phase) => {
      if (phase === "start") {
        generation++;
      } else {
        publish();
      }
    }),
  ];
  return () => {
    generation++;
    stops.forEach((stop) => stop?.());
  };
}
