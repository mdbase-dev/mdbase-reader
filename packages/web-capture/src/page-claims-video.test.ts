// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

it("reads VideoObject upload dates in their published local day and scoped microdata creators", () => {
  const document = new DOMParser().parseFromString(
    `<html><head>
    <title>A short film | Video site</title>
    <script type="application/ld+json">{"@type":"VideoObject","name":"A short film","uploadDate":"2005-04-23T20:31:52-07:00"}</script>
    </head><body><span itemprop="author" itemscope itemtype="https://schema.org/Person">
      <link itemprop="name" content="channel_handle"></span>
      <span itemprop="name">Not the creator</span></body></html>`,
    "text/html",
  );
  const result = resolveCitation({
    claims: pageClaims(document, "https://example.org/video", "2026-10-23T12:00:00Z").claims,
  });
  expect(result.citation).toMatchObject({
    type: "motion_picture",
    title: "A short film",
    author: [{ literal: "channel_handle" }],
    issued: { "date-parts": [[2005, 4, 23]] },
  });
});

it("does not confuse review authors with a video's creators", () => {
  const document = new DOMParser().parseFromString(
    `<html><head>
    <script type="application/ld+json">{"@type":"VideoObject","name":"Film","author":{"@type":"Person","name":"Jane Director"}}</script>
    </head><body><aside itemscope itemtype="https://schema.org/Review">
      <div itemprop="author" itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Bob Reviewer</span></div></aside></body></html>`,
    "text/html",
  );
  const result = resolveCitation({
    claims: pageClaims(document, "https://example.org/video", "2026-10-23T12:00:00Z").claims,
  });
  expect(result.citation?.["author"]).toEqual([{ given: "Jane", family: "Director" }]);
  expect(result.provenance["author"]?.rejected).toBeUndefined();
});

it("does not treat an unscoped name or unrelated Person scope as a video's creator", () => {
  const document = new DOMParser().parseFromString(
    `<html><head>
    <script type="application/ld+json">{"@type":"VideoObject","name":"A short film"}</script>
    </head><body><span itemscope itemtype="https://schema.org/Person"><span itemprop="name">Not an author</span></span></body></html>`,
    "text/html",
  );
  expect(
    pageClaims(document, "https://example.org/video", "2026-10-23T12:00:00Z").claims,
  ).not.toEqual(expect.arrayContaining([expect.objectContaining({ field: "author" })]));
});
