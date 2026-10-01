import { validateCslItem } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { lookUpCitation, WIKIMEDIA_CITOID_ENDPOINT } from "./citation-lookup.js";
import { cslFromZoteroItem } from "./zotero-csl.js";

const now = (): Date => new Date("2026-09-25T00:00:00.000Z");

// Recorded from Citoid on 2026-09-25.
const dostoevsky = {
  key: "TX3RZDTC",
  version: 0,
  itemType: "book",
  creators: [{ firstName: "Fyodor", lastName: "Dostoevsky", creatorType: "author" }],
  tags: [{ tag: "Meditations", type: 1 }],
  ISBN: "9780140449143 9780140449136",
  title: "Crime and punishment",
  edition: "1st complete English language ed",
  place: "London ; New York",
  publisher: "Heinemann",
  date: "2002",
  numPages: "183",
  callNumber: "B2430.W473 P413 2002",
  libraryCatalog: "Library of Congress ISBN",
  accessDate: "2026-09-25",
};

describe("Zotero items as CSL", () => {
  it("maps a catalogue book record", () => {
    const citation = cslFromZoteroItem(dostoevsky);
    expect(citation).toEqual({
      type: "book",
      title: "Crime and punishment",
      author: [{ family: "Dostoevsky", given: "Fyodor" }],
      ISBN: "9780140449143 9780140449136",
      edition: "1st complete English language ed",
      "publisher-place": "London ; New York",
      publisher: "Heinemann",
      issued: { "date-parts": [[2002]] },
      accessed: { "date-parts": [[2026, 9, 25]] },
      "number-of-pages": "183",
      "call-number": "B2430.W473 P413 2002",
      source: "Library of Congress ISBN",
      keyword: "Meditations",
    });
    expect(validateCslItem({ id: "dostoevsky2002crime", ...citation }).valid).toBe(true);
  });

  it("maps item-specific fields, creator roles, single-field names and Extra identifiers", () => {
    expect(
      cslFromZoteroItem({
        itemType: "bookSection",
        title: "On attention",
        bookTitle: "Collected essays",
        pages: "12–30",
        university: "Example University",
        creators: [
          { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
          { firstName: "Mary", lastName: "Shelley", creatorType: "editor" },
          { name: "Committee on Examples", creatorType: "seriesEditor" },
          { firstName: "X", lastName: "Unknown", creatorType: "notARole" },
        ],
        date: "Spring 1843",
        extra: "PMID: 123456\nOther: kept out",
      }),
    ).toEqual({
      type: "chapter",
      title: "On attention",
      "container-title": "Collected essays",
      page: "12-30",
      publisher: "Example University",
      author: [{ family: "Lovelace", given: "Ada" }],
      editor: [{ family: "Shelley", given: "Mary" }],
      "collection-editor": [{ literal: "Committee on Examples" }],
      issued: { literal: "Spring 1843" },
      PMID: "123456",
    });
  });
});

describe("citation lookup", () => {
  it("sends DOIs, DOI URLs and arXiv identifiers to the DOI registry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          type: "article",
          title:
            "Calculation of prompt diphoton production cross sections at Tevatron and LHC energies",
        }),
      ),
    );
    const arxiv = await lookUpCitation(
      { kind: "identifier", value: "arXiv:0704.0001v2" },
      { fetch: fetcher, now },
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://doi.org/10.48550/arXiv.0704.0001");
    expect(arxiv.provenance).toEqual({
      provider: "DOI registry (doi.org)",
      query: "arXiv:0704.0001v2",
      retrievedAt: "2026-09-25T00:00:00.000Z",
    });
    await lookUpCitation(
      { kind: "url", value: "https://onlinelibrary.wiley.com/doi/abs/10.1002/asi.24750" },
      { fetch: fetcher },
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://doi.org/10.1002/asi.24750");
  });

  it("asks Citoid for ISBNs without a prefix and keeps the ISBN that was asked for", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([dostoevsky]));
    const found = await lookUpCitation(
      { kind: "identifier", value: "isbn: 978-0-14-044913-6" },
      { fetch: fetcher, now, clientName: "mdbase-reader (test)" },
    );
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${WIKIMEDIA_CITOID_ENDPOINT}978-0-14-044913-6`);
    expect(new Headers(init?.headers).get("Api-User-Agent")).toBe("mdbase-reader (test)");
    expect(init?.credentials).toBe("omit");
    expect(found.citation).toMatchObject({ id: "candidate", type: "book", ISBN: "9780140449136" });
    expect(found.provenance.provider).toBe("Citoid (Zotero translators via Wikimedia)");
    expect(found.warnings).toEqual([]);
  });

  it("warns that a title search returned the closest of several matches", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([dostoevsky, { ...dostoevsky, title: "Another edition" }]));
    const found = await lookUpCitation(
      { kind: "text", value: "Crime and Punishment Dostoevsky" },
      { fetch: fetcher, citoidEndpoint: "https://translate.example/zotero/" },
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://translate.example/zotero/Crime%20and%20Punishment%20Dostoevsky",
    );
    expect(found.citation["title"]).toBe("Crime and punishment");
    expect(found.provenance.provider).toBe("Zotero translation server");
    expect(found.warnings).toHaveLength(1);
  });

  it("explains pages Citoid could not load", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: "Unable to load URL" }, { status: 404 }));
    await expect(
      lookUpCitation({ kind: "url", value: "https://news.example/story" }, { fetch: fetcher }),
    ).rejects.toThrow(/may block automated requests/u);
  });
});
