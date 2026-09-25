import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnnotationComposer } from "./AnnotationComposer.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";

function composer(kind: "text" | "area"): AnnotationComposerController {
  return {
    selection:
      kind === "text"
        ? {
            kind: "text",
            value: {
              target: { quote: { exact: "Attention is the rarest form of generosity." } },
              locator: { kind: "pdf", page: 4 },
            },
          }
        : { kind: "area", value: { image: new Blob(), locator: { kind: "pdf", page: 4 } } },
    note: "",
    status: "idle",
    error: null,
    canSelectArea: true,
    selectingArea: false,
    canOpenAnnotation: true,
    activeAnnotationId: null,
    editingAnnotationId: null,
    setNote: vi.fn(),
    dismiss: vi.fn(),
    save: vi.fn(),
    toggleAreaSelection: vi.fn(),
    open: vi.fn(),
    edit: vi.fn(),
    stopEditing: vi.fn(),
  } as unknown as AnnotationComposerController;
}

describe("AnnotationComposer", () => {
  it("opens a text selection ready for its comment", () => {
    const markup = renderToStaticMarkup(<AnnotationComposer composer={composer("text")} />);

    expect(markup).toContain('class="annotation-composer is-highlight"');
    expect(markup).toContain("Comment on highlight");
    expect(markup).toContain('aria-label="Comment"');
    expect(markup).not.toContain("Add a comment");
  });

  it("lets an area be saved without a comment", () => {
    expect(renderToStaticMarkup(<AnnotationComposer composer={composer("area")} />)).toContain(
      "Add a comment",
    );
  });

  it("identifies an area selection separately", () => {
    const markup = renderToStaticMarkup(<AnnotationComposer composer={composer("area")} />);

    expect(markup).toContain('class="annotation-composer is-area"');
    expect(markup).toContain("New area annotation");
  });
});
