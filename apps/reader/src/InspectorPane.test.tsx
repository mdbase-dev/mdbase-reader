import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InspectorContent } from "./InspectorPane.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";

describe("InspectorContent", () => {
  it("keeps an in-progress highlight out of the saved annotations pane", () => {
    const workspace = {
      sourceRecord: { status: "loading" },
      annotations: { status: "ready", value: [] },
    } as unknown as ReaderSourceWorkspaceController;
    const composer = {
      selection: {
        kind: "text",
        value: {
          target: { quote: { exact: "An active passage" } },
          locator: { kind: "html", href: "chapter.html" },
        },
      },
      open: vi.fn(),
    } as unknown as AnnotationComposerController;

    const markup = renderToStaticMarkup(
      <InspectorContent
        tab="annotations"
        workspace={workspace}
        composer={composer}
        gateway={{ readFile: vi.fn() } as never}
      />,
    );

    expect(markup).toContain("No annotations yet");
    expect(markup).not.toContain("annotation-composer");
    expect(markup).not.toContain("An active passage");
  });

  it("projects an embedded screenshot into the annotation card", () => {
    const workspace = {
      sourceRecord: { status: "loading" },
      annotations: {
        status: "ready",
        value: [
          {
            id: "ann-area",
            annotationType: "area",
            tags: [],
            body: "![[files/annotation-ann-area.png|Captured chart]]\n\nImportant outlier.",
            createdAt: "2026-08-12T00:00:00.000Z",
          },
        ],
      },
      transclusion: {
        busyId: null,
        problemId: null,
        problem: null,
        isEmbedded: () => false,
        insert: vi.fn(),
      },
      updateAnnotation: vi.fn(),
      planAnnotationDeletion: vi.fn(),
      deleteAnnotation: vi.fn(),
    } as unknown as ReaderSourceWorkspaceController;
    const markup = renderToStaticMarkup(
      <InspectorContent
        tab="annotations"
        workspace={workspace}
        composer={{ open: vi.fn() } as unknown as AnnotationComposerController}
        gateway={{ readFile: vi.fn() } as never}
      />,
    );

    expect(markup).toContain("Loading screenshot…");
    expect(markup).toContain("Important outlier.");
    expect(markup).not.toContain("![[files/annotation-ann-area.png");
  });
});
