import { CitationChangedElsewhereError, loadedCitation, type Source } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { PreviewGateway } from "./preview.js";

async function firstSource(gateway: PreviewGateway): Promise<Source> {
  const summary = (await gateway.library()).sources[0]!;
  const source = await gateway.source(summary.id);
  expect(source).not.toBeNull();
  return source!;
}

describe("preview citation save guards", () => {
  it("rejects a stale editor with the current raw citation and provenance", async () => {
    const gateway = new PreviewGateway();
    const source = await firstSource(gateway);
    const baseline = loadedCitation(source);
    const citation = { ...source.citation, id: "preview", type: "book", title: "Other pane" };
    const provenance = { title: { value: "Other pane", source: "user" } };
    const saved = await gateway.saveSourceCitation(source, citation, {
      expectedCitation: baseline,
      provenance,
    });
    expect(saved.properties).toEqual(saved.frontmatter);
    await expect(
      gateway.saveSourceCitation(
        source,
        { ...citation, title: "Stale pane" },
        {
          expectedCitation: baseline,
        },
      ),
    ).rejects.toMatchObject({
      currentCitation: citation,
      currentProvenance: provenance,
    });
    expect(loadedCitation((await gateway.source(source.id))!)).toEqual(citation);
    await expect(
      gateway.saveSourceCitation(
        saved,
        { ...citation, title: "Retry" },
        {
          expectedCitation: citation,
        },
      ),
    ).resolves.toMatchObject({ citation: { title: "Retry" } });
  });

  it("guards explicit undefined but permits callers without a citation baseline", async () => {
    const gateway = new PreviewGateway();
    const source = await firstSource(gateway);
    const citation = { id: "preview", type: "book", title: "First save" };
    await gateway.saveSourceCitation(source, citation);
    await expect(
      gateway.saveSourceCitation(source, citation, {
        expectedCitation: undefined,
      }),
    ).rejects.toBeInstanceOf(CitationChangedElsewhereError);
    await expect(
      gateway.saveSourceCitation(source, { ...citation, title: "Unguarded" }),
    ).resolves.toMatchObject({
      citation: { title: "Unguarded" },
    });
  });
});
