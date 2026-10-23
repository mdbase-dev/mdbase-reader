import { describe, expect, it, vi } from "vitest";

import { citationForPage } from "./page-citation.js";
import { citoidClaims, doiClaims } from "./provider-claims.js";
import { createProviderQueue } from "./provider-queue.js";
import { remoteCitationClaims } from "./remote-citation.js";
import { compareRemoteWork } from "./remote-work-identity.js";
import { resolveCitation } from "./resolver.js";

import type { ClaimBatch } from "./claims.js";
import type { RemoteWorkIdentity } from "./remote-work-identity.js";

const observedAt = "2026-10-23T00:00:00Z";
const url = "https://example.org/work";
const citation = {
  title: "A Study of Trees: Methods and Results",
  author: [{ family: "García", given: "A." }],
  issued: { "date-parts": [[2024, 2, 3]] },
  "container-title": "Journal of Trees",
};
const work: RemoteWorkIdentity = { citation, url };
const page: ClaimBatch = {
  claims: Object.entries(citation).map(([field, value]) => ({
    field,
    value,
    observedAt,
    source: { kind: "page", signal: "highwire" },
  })),
};
const queue = (): ReturnType<typeof createProviderQueue> => createProviderQueue();

function remote(value: Record<string, unknown>): RemoteWorkIdentity {
  return { citation: value };
}

describe("remote work identity", () => {
  it("accepts a matching DOI even with contradictory titles, dates, authors and URLs", () => {
    expect(
      compareRemoteWork(
        remote({ ...citation, DOI: "https://doi.org/10.1234/WORK" }),
        remote({
          DOI: "doi:10.1234/work",
          title: "Another title",
          author: [{ family: "Other" }],
          URL: "https://elsewhere.org/",
        }),
      ),
    ).toBe("same");
  });

  it.each([
    { author: [{ family: "Garcia" }] },
    { issued: { "date-parts": [["2024"]] } },
    { "container-title": "JOURNAL OF TREES" },
  ])("requires a normalized title and at least one independent anchor: %j", (anchor) => {
    expect(
      compareRemoteWork(
        work,
        remote({ title: "A study of trees — methods & results!", ...anchor }),
      ),
    ).toBe("same");
  });

  it("does not confirm a title alone or a similar title with conflicting anchors", () => {
    expect(compareRemoteWork(work, remote({ title: citation.title }))).toBe("uncertain");
    expect(
      compareRemoteWork(
        work,
        remote({
          title: citation.title,
          author: [{ family: "Other" }],
          issued: { "date-parts": [[1999]] },
        }),
      ),
    ).toBe("uncertain");
    expect(compareRemoteWork(work, remote({ author: citation.author }))).toBe("uncertain");
  });

  it("rejects unrelated titles, distinct identifiers and distinct arXiv works", () => {
    expect(
      compareRemoteWork(
        work,
        remote({ title: "The History of the Roman Empire", issued: citation.issued }),
      ),
    ).toBe("mismatch");
    expect(
      compareRemoteWork(
        remote({ ...citation, DOI: "10.1234/one" }),
        remote({ ...citation, DOI: "10.1234/two" }),
      ),
    ).toBe("mismatch");
    expect(
      compareRemoteWork(
        { citation: {}, identifiers: { arxiv: "1706.03762" } },
        { citation: {}, identifiers: { arxiv: "1412.6980" } },
      ),
    ).toBe("mismatch");
  });

  it("accepts normalized ISBNs, canonical URLs and arXiv abstract/PDF identifiers", () => {
    expect(
      compareRemoteWork(remote({ ISBN: "978-1-234-56789-0" }), remote({ ISBN: "9781234567890" })),
    ).toBe("same");
    expect(
      compareRemoteWork(
        { citation: {}, url: "https://example.org/work#section" },
        remote({ URL: "http://EXAMPLE.org/work" }),
      ),
    ).toBe("same");
    expect(
      compareRemoteWork(
        { citation: {}, url: "https://arxiv.org/abs/1706.03762" },
        remote({ URL: "https://arxiv.org/pdf/1706.03762v7.pdf", type: "article" }),
      ),
    ).toBe("same");
    expect(
      compareRemoteWork(
        { citation: {}, url: "https://example.org/work?edition=1" },
        remote({ URL: "https://example.org/work?edition=2" }),
      ),
    ).toBe("uncertain");
  });

  it("rejects publication versions even with the preprint's title, author and backlink", () => {
    const preprint = {
      ...work,
      url: "https://arxiv.org/abs/1603.02754",
      identifiers: { doi: "10.1145/2939672.2939785" },
    };
    expect(
      compareRemoteWork(
        preprint,
        remote({
          ...citation,
          type: "paper-conference",
          URL: preprint.url,
          DOI: preprint.identifiers.doi,
        }),
      ),
    ).toBe("mismatch");
    expect(
      compareRemoteWork(
        preprint,
        remote({ ...citation, type: "article-journal", URL: preprint.url }),
      ),
    ).toBe("mismatch");
    expect(
      compareRemoteWork(
        preprint,
        remote({ DOI: "10.48550/arXiv.1603.02754", type: "paper-conference" }),
      ),
    ).toBe("same");
  });
});

describe("remote identity at the provider boundary", () => {
  it("still lets a legitimately richer registry record win with title and author agreement", async () => {
    const batch = await doiClaims("10.1234/trees", {
      work,
      queue: queue(),
      fetch: () =>
        Promise.resolve(
          Response.json({
            ...citation,
            title: "A Study of Trees — Methods and Results",
            type: "journal-article",
            publisher: "Tree Press",
            issued: { "date-parts": [[2025]] },
          }),
        ),
    });
    expect(batch.outcome?.result).toBe("ok");
    const resolved = resolveCitation({ claims: [...page.claims, ...batch.claims] });
    expect(resolved.citation).toMatchObject({
      type: "article-journal",
      publisher: "Tree Press",
      issued: { "date-parts": [[2025]] },
    });
    expect(resolved.provenance["issued"]?.source).toBe("registry:doi.org doi.org CSL");
  });

  it("downgrades uncertain registry records, rather than treating a requested DOI as proof", async () => {
    const batch = await doiClaims("10.1234/trees", {
      work,
      queue: queue(),
      fetch: () =>
        Promise.resolve(Response.json({ title: citation.title, publisher: "Tree Press" })),
    });
    expect(batch.outcome?.result).toBe("uncertain");
    expect(batch.claims.every((claim) => claim.source.kind === "generic-remote")).toBe(true);
    expect(
      resolveCitation({ claims: [...page.claims, ...batch.claims] }).citation?.["publisher"],
    ).toBe("Tree Press");
  });

  it("preserves a response's conflicting DOI instead of replacing it with the request DOI", async () => {
    const batch = await doiClaims("10.1234/trees", {
      work: { citation: { DOI: "10.1234/trees" } },
      queue: queue(),
      fetch: () =>
        Promise.resolve(Response.json({ title: citation.title, DOI: "10.1234/unrelated" })),
    });
    expect(batch).toMatchObject({ claims: [], outcome: { result: "mismatch" } });
    expect(batch.identifiers).toBeUndefined();
  });
});

describe("identity-aware remote orchestration", () => {
  it("does not follow a rejected Citoid record's DOI or send the comparison context", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json([
          { itemType: "journalArticle", title: "The Roman Empire", DOI: "10.1234/unrelated" },
        ]),
      );
    const accepted: ClaimBatch[] = [];
    await remoteCitationClaims(
      url,
      undefined,
      { work, fetch, citoid: {}, queue: queue() },
      (batch) => accepted.push(batch),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(citation.title);
    expect(accepted).toMatchObject([
      { claims: [], outcome: { provider: "citoid", result: "mismatch" } },
    ]);
  });

  it("does not let an uncertain Citoid DOI self-confirm an unrelated registry record", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json([
          { itemType: "journalArticle", title: citation.title, DOI: "10.1234/discovered" },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json({ title: "The Roman Empire", DOI: "10.1234/discovered" }),
      );
    const accepted: ClaimBatch[] = [];
    await remoteCitationClaims(
      url,
      undefined,
      { work, fetch, citoid: {}, queue: queue() },
      (batch) => accepted.push(batch),
    );
    expect(accepted.map((batch) => batch.outcome?.result)).toEqual(["uncertain", "mismatch"]);
    expect(accepted[0]?.claims.every((claim) => claim.source.kind === "generic-remote")).toBe(true);
    expect(accepted[1]?.claims).toEqual([]);
  });

  it("falls back after a mismatched registry response and keeps confirmed enrichment", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ title: "The Roman Empire", DOI: "10.1234/other" }))
      .mockResolvedValueOnce(
        Response.json([
          { itemType: "journalArticle", title: citation.title, url, publisher: "Tree Press" },
        ]),
      );
    const preview = await citationForPage({ ...page, identifiers: { doi: "10.1234/trees" } }, url, {
      fetch,
      citoid: {},
      queue: queue(),
    });
    expect(preview?.outcomes.map((outcome) => outcome.result)).toEqual(["mismatch", "ok"]);
    expect(preview?.citation["publisher"]).toBe("Tree Press");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("checks private Translation Server records too", async () => {
    const batch = await citoidClaims(url, {
      work,
      queue: queue(),
      citoidEndpoint: "https://translator.example/",
      fetch: () =>
        Promise.resolve(Response.json([{ title: "The Roman Empire", itemType: "book" }])),
    });
    expect(batch).toMatchObject({
      claims: [],
      outcome: { provider: "translation-server", result: "mismatch" },
    });
  });

  it("publishes an outcome-only update so the page preview can explain a dropped record", async () => {
    const onUpdate = vi.fn();
    const preview = await citationForPage(page, url, {
      citoid: {},
      queue: queue(),
      onUpdate,
      fetch: () =>
        Promise.resolve(Response.json([{ title: "The Roman Empire", itemType: "book" }])),
    });
    expect(preview?.citation["title"]).toBe(citation.title);
    expect(preview?.problem).toContain("different work");
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.lastCall?.[0].outcomes).toMatchObject([{ result: "mismatch" }]);
  });
});
