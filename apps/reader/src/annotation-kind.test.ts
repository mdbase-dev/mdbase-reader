import { expect, it } from "vitest";

import { annotationKindLabel } from "./annotation-kind.js";

it("labels stored annotation kinds without renaming them", () => {
  expect(annotationKindLabel("note")).toBe("Source comment");
  expect(annotationKindLabel("area")).toBe("Area capture");
  expect(annotationKindLabel("highlight")).toBe("Highlight");
  expect(annotationKindLabel("bookmark")).toBe("Bookmark");
});
