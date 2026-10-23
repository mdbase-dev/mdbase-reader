// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

function extract(
  node: Record<string, unknown>,
  tags = "",
): ReturnType<typeof resolveCitation>["citation"] {
  const document = new DOMParser().parseFromString(
    `<title>Example work</title>${tags}<script type="application/ld+json">${JSON.stringify(node)}</script>`,
    "text/html",
  );
  const batch = pageClaims(document, "https://example.org/work", "2026-10-23T00:00:00Z");
  return resolveCitation(batch).citation;
}

it.each([
  ["Legislation", "legislation"],
  ["PodcastEpisode", "broadcast"],
  ["Book", "book"],
  ["Report", "report"],
  ["Dataset", "dataset"],
])("uses specific schema.org %s, including full schema IRIs", (schema, type) => {
  for (const prefix of ["", "https://schema.org/", "http://schema.org/"]) {
    expect(extract({ "@type": `${prefix}${schema}`, name: "Example work" })?.type).toBe(type);
  }
});

it("keeps legislation enactment dates and identifiers distinct from modification", () => {
  expect(
    extract({
      "@type": "Legislation",
      name: "An Act",
      legislationIdentifier: "2024 c. 5",
      legislationDate: "2024-03-12",
      dateModified: "2026-01-01",
    }),
  ).toMatchObject({
    type: "legislation",
    number: "2024 c. 5",
    issued: { "date-parts": [[2024, 3, 12]] },
  });
});

it("reads standard podcast series, episode number and publication metadata", () => {
  expect(
    extract({
      "@type": "PodcastEpisode",
      name: "A conversation",
      episodeNumber: 12,
      partOfSeries: { "@type": "PodcastSeries", name: "The show" },
      author: { "@type": "Person", name: "Jane Smith" },
      datePublished: "2025-02-10",
      publisher: { "@type": "Organization", name: "Audio Company" },
    }),
  ).toMatchObject({
    type: "broadcast",
    number: "12",
    "container-title": "The show",
    author: [{ family: "Smith", given: "Jane" }],
    issued: { "date-parts": [[2025, 2, 10]] },
    publisher: "Audio Company",
  });
});

it("preserves editor roles and report numbers on standard work metadata", () => {
  expect(
    extract({
      "@type": "Report",
      name: "A report",
      reportNumber: "TR-15",
      editor: { "@type": "Person", name: "Jane Smith" },
    }),
  ).toMatchObject({
    type: "report",
    number: "TR-15",
    editor: [{ family: "Smith", given: "Jane" }],
  });
});

it.each(["patent", "legislation", "working-paper", "redif-paper", "dataset", "podcast-episode"])(
  "understands explicit bibliographic genre %s in DC/citation tags",
  (genre) => {
    const types: Record<string, string> = {
      patent: "patent",
      legislation: "legislation",
      "working-paper": "report",
      "redif-paper": "report",
      dataset: "dataset",
      "podcast-episode": "broadcast",
    };
    expect(extract({}, `<meta name="DC.type" content="${genre}">`)?.type).toBe(types[genre]);
  },
);

it("resolves editor and podcast-series references within the selected graph", () => {
  const citation = extract({
    "@graph": [
      {
        "@type": "PodcastEpisode",
        name: "A conversation",
        editor: { "@id": "#editor" },
        partOfSeries: { "@id": "#series" },
      },
      { "@id": "#editor", "@type": "Person", name: "Jane Smith" },
      { "@id": "#series", "@type": "PodcastSeries", name: "The show" },
    ],
  });
  expect(citation).toMatchObject({
    editor: [{ family: "Smith", given: "Jane" }],
    "container-title": "The show",
  });
});

it("does not treat submitted/modified DC dates as publication dates", () => {
  expect(
    extract(
      {},
      '<meta name="DC.date" scheme="dateSubmitted" content="1998-01-09"><meta name="DC.date" scheme="dateModified" content="2026-01-01"><meta name="DC.date" scheme="issue" content="2001-09-04">',
    )?.["issued"],
  ).toEqual({ "date-parts": [[2001, 9, 4]] });
});

it("ignores extra fields on nodes explicitly describing a different work", () => {
  const citation = extract({
    "@type": "Legislation",
    url: "https://elsewhere.example/act",
    legislationIdentifier: "2099 c. 100",
    legislationDate: "2099-01-01",
  });
  expect(citation?.["number"]).toBeUndefined();
  expect(citation?.["issued"]).toBeUndefined();
});

it("does not interpret another vocabulary's schema-looking types or generic prose genres", () => {
  expect(
    extract({ "@type": "https://evil.example/Legislation", legislationIdentifier: "fake" })?.type,
  ).toBe("webpage");
  expect(
    extract(
      {},
      '<meta name="DC.type" content="Text"><meta name="description" content="a report about datasets">',
    )?.type,
  ).toBe("webpage");
});
