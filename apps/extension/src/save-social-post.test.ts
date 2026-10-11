// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { annotationQuotes } from "./page-annotations.js";
import { scopePostQuotes } from "./social-quotes.js";
import { capture, fixture } from "./testing/save-capture-fixture.js";

import type { SelectedWebCapture } from "./page-capture.js";

function postCapture(): SelectedWebCapture {
  const first = {
    platform: "x" as const,
    id: "100",
    url: "https://x.com/i/status/100",
    author: { id: "fixture", handle: "fixture", name: "Fixture Author" },
    text: "Repeated passage",
    media: [],
  };
  const second = { ...first, id: "101", url: "https://x.com/i/status/101", inReplyTo: "100" };
  return {
    ...capture,
    html: "",
    canonicalUrl: first.url,
    submittedUrl: first.url,
    selection: { exact: "Repeated passage" },
    selectionPostId: second.id,
    post: { ...first, threadRoot: first.id, threadPartial: true, parts: [first, second] },
  };
}

describe("social source/highlight persistence", () => {
  it("creates a post source and post CSL citation, with a part-specific HTML selector", async () => {
    const f = fixture();
    const page = postCapture();
    const saved = await f.save({}, page);
    expect(f.commit.mock.calls[0]?.[0]).toMatchObject({
      kind: "post",
      metadata: { socialPost: page.post },
    });
    expect(saved.source.citation?.type).toBe("post");
    expect(saved.annotation?.target).toMatchObject({
      quote: { exact: "Repeated passage" },
      html: { css: '[data-post-id="101"]' },
    });
    const quotes = annotationQuotes([saved.annotation!]);
    expect(scopePostQuotes(quotes, page.post)[0]?.postUrl).toBe("https://x.com/i/status/101");
  });
  it("does not mistake identical selections on two thread parts for a highlight retry", async () => {
    const f = fixture();
    const page = postCapture();
    const first = await f.save({}, page);
    const second = await f.save(
      {},
      { ...page, selectionPostId: "100" },
      { known: first.source, lookedUp: true },
    );
    expect(second.source.id).toBe(first.source.id);
    expect(second.annotation?.id).not.toBe(first.annotation?.id);
    expect(second.annotation?.target?.html?.css).toBe('[data-post-id="100"]');
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.create).toHaveBeenCalledTimes(2);
  });
  it("refuses to anchor a highlight to a part absent from the saved revision", async () => {
    const f = fixture();
    await expect(f.save({}, { ...postCapture(), selectionPostId: "999" })).rejects.toThrow(
      "part is absent",
    );
    expect(f.onSource).toHaveBeenCalledOnce();
    expect(f.create).not.toHaveBeenCalled();
  });
  it("never sends an unselected feed to the source importer", async () => {
    const f = fixture();
    await expect(
      f.save(
        {},
        {
          ...capture,
          html: "",
          selection: null,
          social: { mode: "multiple", items: [], nearest: null },
        },
      ),
    ).rejects.toThrow("feeds cannot be saved");
    expect(f.commit).not.toHaveBeenCalled();
  });
});
