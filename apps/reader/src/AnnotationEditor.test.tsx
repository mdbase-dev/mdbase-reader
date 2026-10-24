import { annotationId, recordRevision } from "@mdbase-reader/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AnnotationDeleteConfirmation } from "./AnnotationEditor.js";

it("names the notes that embed an annotation by title before deleting it", () => {
  const html = renderToStaticMarkup(
    <AnnotationDeleteConfirmation
      plan={{
        annotationId: annotationId("ann_1"),
        path: "annotations/ann_1.md",
        expectedRevision: recordRevision("rev-1"),
        brokenLinkPaths: ["notes/Reading week.md", "Memory.md"],
      }}
      deleting={false}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );

  expect(html).toContain("These notes embed this annotation and will show it as missing:");
  expect(html).toContain('<li title="notes/Reading week.md">Reading week</li>');
  expect(html).toContain('<li title="Memory.md">Memory</li>');
});
