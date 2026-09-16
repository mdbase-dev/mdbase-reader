import { collectionId, fileId, fileRevision, recordRevision, sourceId } from "@mdbase-reader/core";
import { createEventEmitter } from "@mdbase-reader/reading-surface";
import { describe, expect, it, vi } from "vitest";

import { saveSelection, subscribeToSelections } from "./use-annotation-composer.js";

import type { Annotation, Source } from "@mdbase-reader/core";
import type {
  AreaSelectionDraft,
  ReadingSurface,
  TextSelectionDraft,
} from "@mdbase-reader/reading-surface";

describe("annotation composer selections", () => {
  it("subscribes as soon as the active source id and surface are known", () => {
    const textSelections = createEventEmitter<TextSelectionDraft>();
    const areaSelections = createEventEmitter<AreaSelectionDraft>();
    const surface = readingSurface(textSelections, areaSelections);
    const select = vi.fn();
    const activeSourceId = sourceId("src_01");
    const selection: TextSelectionDraft = {
      locator: { kind: "pdf", pageIndex: 2 },
      target: {
        quote: { exact: "Attention is a discipline." },
        pdf: {
          pageIndex: 2,
          coordinateSpace: {
            profile: "embedpdf-selection-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 110, 20, 10, 35, 110, 35]],
        },
      },
    };

    const unsubscribe = subscribeToSelections(activeSourceId, surface, select);
    textSelections.emit(selection);

    expect(select).toHaveBeenCalledWith({
      sourceId: activeSourceId,
      surface,
      value: { kind: "text", value: selection },
    });

    unsubscribe?.();
    textSelections.emit(selection);
    expect(select).toHaveBeenCalledOnce();
  });

  it("does not subscribe without an active source identity", () => {
    const textSelections = createEventEmitter<TextSelectionDraft>();
    const surface = readingSurface(textSelections, createEventEmitter<AreaSelectionDraft>());
    const select = vi.fn();

    expect(subscribeToSelections(null, surface, select)).toBeUndefined();
    textSelections.emit({
      locator: { kind: "pdf", pageIndex: 0 },
      target: { quote: { exact: "Unobserved" } },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("starts preparing area image bytes when the capture arrives", () => {
    const areaSelections = createEventEmitter<AreaSelectionDraft>();
    const surface = readingSurface(createEventEmitter<TextSelectionDraft>(), areaSelections);
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const arrayBuffer = vi.spyOn(image, "arrayBuffer");

    subscribeToSelections(sourceId("src_01"), surface, vi.fn());
    areaSelections.emit({
      pageIndex: 1,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      coordinateProfile: "embedpdf-capture-page-points-v1",
      image,
      imageType: "image/png",
      scale: 2,
      withAnnotations: true,
    });

    expect(arrayBuffer).toHaveBeenCalledOnce();
  });
});

describe("annotation composer persistence", () => {
  it("retains a captured selection when persistence fails", async () => {
    const surface = readingSurface(
      createEventEmitter<TextSelectionDraft>(),
      createEventEmitter<AreaSelectionDraft>(),
    );
    const dismiss = vi.fn();
    const setProblem = vi.fn();
    const setStatus = vi.fn();
    const create = vi.fn().mockRejectedValue(new Error("Upload interrupted"));

    await saveSelection(
      { source, surface, create },
      {
        kind: "text",
        value: {
          locator: { kind: "pdf", pageIndex: 0 },
          target: { quote: { exact: "Keep this selection available." } },
        },
      },
      "",
      dismiss,
      setProblem,
      setStatus,
    );

    expect(dismiss).not.toHaveBeenCalled();
    expect(setProblem).toHaveBeenCalledWith({
      sourceId: source.id,
      message: "Upload interrupted",
    });
    expect(setStatus).toHaveBeenLastCalledWith("idle");
  });

  it("dismisses the selection only after persistence succeeds", async () => {
    const surface = readingSurface(
      createEventEmitter<TextSelectionDraft>(),
      createEventEmitter<AreaSelectionDraft>(),
    );
    const dismiss = vi.fn();
    const setStatus = vi.fn();
    let finish!: (annotation: Annotation) => void;
    const create = vi.fn(
      () =>
        new Promise<Annotation>((resolve) => {
          finish = resolve;
        }),
    );
    const saving = saveSelection(
      { source, surface, create },
      {
        kind: "text",
        value: {
          locator: { kind: "pdf", pageIndex: 0 },
          target: { quote: { exact: "Persist before closing." } },
        },
      },
      "",
      dismiss,
      vi.fn(),
      setStatus,
    );

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(dismiss).not.toHaveBeenCalled();

    finish({} as Annotation);
    await saving;

    expect(dismiss).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenLastCalledWith("idle");
  });
});

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "Example",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("source-r1"),
  frontmatter: {},
};

function readingSurface(
  textSelections: ReturnType<typeof createEventEmitter<TextSelectionDraft>>,
  areaSelections: ReturnType<typeof createEventEmitter<AreaSelectionDraft>>,
): ReadingSurface {
  return {
    kind: "pdf",
    document: {
      document: {
        fileId: fileId("file-01"),
        file: "[[files/example.pdf]]",
        revision: fileRevision(`sha256:${"a".repeat(64)}`),
      },
      mediaType: "application/pdf",
      url: "blob:pdf",
    },
    capabilities: {
      textSelection: { selections: textSelections, clearSelection: vi.fn() },
      areaSelection: {
        selections: areaSelections,
        beginAreaSelection: vi.fn(),
        cancelAreaSelection: vi.fn(),
      },
    },
    locations: createEventEmitter(),
    currentLocation: () => ({ kind: "pdf", pageIndex: 0 }),
    goTo: () => Promise.resolve(true),
    destroy: () => Promise.resolve(),
  };
}
