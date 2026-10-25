import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CitationQualitySummary } from "./CitationQualitySummary.js";

import type { SourceSummary } from "@mdbase-reader/core";

it("renders only local aggregate counts, including partial-library context", () => {
  const source = {
    citation: { id: "private-key", type: "book", title: "Private title" },
    properties: {
      "csl-provenance": { title: { value: "Private title", source: "registry:doi.org" } },
    },
  } as unknown as SourceSummary;
  const markup = renderToStaticMarkup(<CitationQualitySummary sources={[source]} loading />);
  expect(markup).toContain("Citation quality · local only");
  expect(markup).toContain("library still loading");
  expect(markup).toContain("nothing is sent or retained");
  expect(markup).toContain("Identifier registry");
  expect(markup).not.toMatch(/Private title|private-key|doi.org/u);
});

it("names every kind of evidence in plain words", () => {
  const markup = renderToStaticMarkup(<CitationQualitySummary sources={[]} loading={false} />);
  for (const label of [
    "From the book",
    "Identifier registry",
    "From the web page",
    "Page metadata",
    "From an online lookup",
    "Edited manually",
    "No recorded source",
  ]) {
    expect(markup).toContain(label);
  }
  expect(markup).not.toMatch(/Site translator|Unrecorded|Remote metadata/u);
});

describe("empty quality summary", () => {
  it("renders an empty library without a request", () => {
    expect(renderToStaticMarkup(<CitationQualitySummary sources={[]} loading={false} />)).toContain(
      "0 indexed sources",
    );
  });
});
