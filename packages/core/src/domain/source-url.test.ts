import { describe, expect, it } from "vitest";

import { normalizedSourceUrl, sameSourceUrl, sourceUrlSearchKey } from "./source-url.js";

describe("source URL identity", () => {
  it("drops tracking, fragments, www, trailing slashes and default ports", () => {
    expect(
      normalizedSourceUrl(
        "https://WWW.Example.com:443/story/?utm_source=mail&ref=hn&mc_cid=1&page=2#note",
      ),
    ).toBe("https://example.com/story?page=2");
  });

  it("orders remaining parameters so equivalent spellings compare equal", () => {
    expect(normalizedSourceUrl("https://example.com/a?b=2&a=1")).toBe(
      normalizedSourceUrl("https://example.com/a?a=1&b=2"),
    );
  });

  it("treats AMP variants and AMP cache URLs as the original page", () => {
    const original = normalizedSourceUrl("https://example.com/news/story");
    expect(normalizedSourceUrl("https://www.example.com/news/story/amp/")).toBe(original);
    expect(normalizedSourceUrl("https://example.com/news/story?amp=1")).toBe(original);
    expect(
      normalizedSourceUrl(
        "https://www-example-com.cdn.ampproject.org/c/s/www.example.com/news/story",
      ),
    ).toBe(original);
  });

  it("keeps meaningful path case and query state", () => {
    expect(normalizedSourceUrl("https://example.com/Wiki/Page?id=7")).toBe(
      "https://example.com/Wiki/Page?id=7",
    );
  });

  it("never matches non-URL identifiers", () => {
    expect(sameSourceUrl("10.1234/example", normalizedSourceUrl("https://example.com"))).toBe(
      false,
    );
  });

  it("derives a search key every stored spelling contains", () => {
    const key = sourceUrlSearchKey("https://www.example.com/News/Story/?utm_source=x");
    expect(key).toBe("example.com/news/story");
    for (const stored of [
      "https://www.example.com/News/Story/",
      "https://example.com/News/Story?utm_source=feed",
      "https://example.com/News/Story/amp",
    ]) {
      expect(stored.toLowerCase()).toContain(key);
    }
  });
});
