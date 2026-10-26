import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  slug,
  sourceLink,
  sourceNotePaths,
  type Annotation,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { nameTemplateProblem, renderNameTemplate } from "./name-template-engine.js";
import {
  annotationNamePreview,
  annotationPathCandidates,
  defaultAnnotationNameTemplate,
  defaultSourceNameTemplate,
  sourceNameVariables,
  sourceNoteNamePreview,
  sourceNotePathCandidates,
  type SourceNameFacts,
} from "./naming-templates.js";

const source: SourceNameFacts = {
  id: "src_0123456789abcdef",
  title: "Attention Is All You Need",
  creators: ["Ashish Vaswani", "Noam Shazeer"],
  authorYear: { family: "Vaswani", year: "2017" },
  kind: "paper",
  published: "2017-06-12",
  site: "arXiv",
  savedAt: "2026-10-01T09:30:00.000Z",
};

const titles = [
  "Attention Is All You Need",
  "Ångström: ünïcödé titles, with “quotes”",
  "日本語のタイトル",
  "CON",
  "   ",
  "!!!",
  "A very long title that goes on and on well past the sixty code points a slug keeps",
  "Don't Panic",
  "x/y\\z:*?",
];

describe("default templates reproduce today's names", () => {
  it.each(titles)("source note %j", async (title) => {
    const input = { ...source, title };
    const own = sourceNotePaths({ title, id: source.id, authorYear: source.authorYear });
    expect(await sourceNotePathCandidates(defaultSourceNameTemplate, input)).toEqual(own);
    // Rendered for real rather than recognised as the default: the same names.
    expect(await sourceNotePathCandidates("{{ title | slug:60 }}", input)).toEqual(own);
    // The filter is Reader's own slug, which today's names start from.
    const rendered = await renderNameTemplate(defaultSourceNameTemplate, { title });
    expect(rendered.output).toBe(slug(title, 60));
  });

  it("keeps the planned paths when the template gives Reader's own names", async () => {
    const planned = ["sources/planned.md", "sources/planned-2.md"];
    expect(
      await sourceNotePathCandidates(defaultSourceNameTemplate, source, undefined, planned),
    ).toBe(planned);
  });

  it("names an annotation by its ID", async () => {
    expect(await annotationPathCandidates(defaultAnnotationNameTemplate, annotation())).toEqual([
      "annotations/ann_0011223344556677.md",
    ]);
  });
});

describe("source note templates", () => {
  it("puts the rendered name first, then fallbacks built from it", async () => {
    expect(await sourceNotePathCandidates("{{ author }} {{ year }} - {{ title }}", source)).toEqual(
      [
        "sources/Vaswani 2017 - Attention Is All You Need.md",
        "sources/Vaswani 2017 - Attention Is All You Need-vaswani-2017.md",
        "sources/Vaswani 2017 - Attention Is All You Need-cdef.md",
        "sources/Vaswani 2017 - Attention Is All You Need-89abcdef.md",
        "sources/src_0123456789abcdef.md",
      ],
    );
  });

  it("makes each folder segment safe", async () => {
    const paths = await sourceNotePathCandidates(
      '{{ date | date:"YYYY" }}/{{ site }}: papers/{{ title | slug:20 }}',
      source,
    );
    expect(paths[0]).toBe("sources/2026/arXiv papers/attention-is-all-you.md");
    expect(paths.at(-1)).toBe("sources/src_0123456789abcdef.md");
  });

  it("keeps names a wikilink can point at", async () => {
    const paths = await sourceNotePathCandidates("{{ author }} - {{ title }}", {
      ...source,
      title: "C# in Depth [[2nd ed]] ^ref",
    });
    expect(paths[0]).toBe("sources/Vaswani - C in Depth 2nd ed ref.md");
    for (const path of paths) {
      expect(path).not.toMatch(/[#^[\]|]/u);
      expect(() => sourceLink({ path, title: "C# in Depth" })).not.toThrow();
    }
  });

  it("uses the defaults when the template nests too deep", async () => {
    expect(await sourceNotePathCandidates("a/b/c/d/{{ title }}", source)).toEqual(
      sourceNotePaths(source),
    );
  });

  it.each([
    ["an unknown filter", "{{ title | shout }}"],
    ["a parse error", "{{ title"],
    ["nothing rendered", "{{ missing }}"],
    ["only unsafe characters", '{{ title | replace:"Attention Is All You Need":"<>:?" }}'],
  ])("falls back to the defaults on %s", async (_case, template) => {
    const preview = await sourceNoteNamePreview(template, source);
    expect(preview.paths).toEqual(sourceNotePaths(source));
    expect(preview.usedDefault).toBe(true);
  });

  it("says why an invalid template cannot be used", async () => {
    expect(await nameTemplateProblem("{{ title | shout }}")).toMatch(/Unknown filter "shout"/u);
    expect(await nameTemplateProblem("{{ title")).toMatch(/closing/u);
    expect(await nameTemplateProblem("  ")).toBe("Enter a template.");
    expect(await nameTemplateProblem("x".repeat(501))).toMatch(/500/u);
    expect(await nameTemplateProblem('{{ title | slug:"wide" }}')).toMatch(/whole number/u);
    expect(await nameTemplateProblem(defaultSourceNameTemplate)).toBeUndefined();
  });

  it("stops a template that does too much", async () => {
    const template =
      "{% for a in authors %}{% for b in authors %}{{ title }}{% endfor %}{% endfor %}";
    const many = {
      ...source,
      creators: Array.from({ length: 200 }, (_, index) => `A${String(index)}`),
    };
    const preview = await sourceNoteNamePreview(template, many);
    expect(preview.usedDefault).toBe(true);
    expect(preview.paths[0]).toBe("sources/attention-is-all-you-need.md");
  });

  it("gives a chapter its book's details", () => {
    expect(
      sourceNameVariables(
        {
          id: "src_chapter",
          title: "Introduction",
          citation: {
            type: "chapter",
            publisher: "MIT Press",
            author: [{ family: "Hopper", given: "Grace" }],
            issued: { "date-parts": [[1999]] },
          },
        },
        {
          title: "Collected Papers",
          path: "sources/collected-papers.md",
          creators: ["Lovelace, Ada"],
          published: "1998",
        },
      ),
    ).toMatchObject({
      title: "Introduction",
      authors: ["Grace Hopper"],
      author: "Hopper",
      year: "1999",
      type: "chapter",
      publisher: "MIT Press",
      short_id: "chapter",
      parent_title: "Collected Papers",
      parent_author: "Lovelace",
      parent_year: "1998",
      parent_stem: "collected-papers",
    });
  });
});

describe("annotation templates", () => {
  it("renders from the annotation and keeps it directly under annotations/", async () => {
    expect(
      await annotationPathCandidates("{{ source_stem }}/p{{ page }} {{ words }}", annotation()),
    ).toEqual([
      "annotations/attention p3 the-dominant-sequence-transduction.md",
      "annotations/attention p3 the-dominant-sequence-transduction-6677.md",
      "annotations/attention p3 the-dominant-sequence-transduction-44556677.md",
      "annotations/ann_0011223344556677.md",
    ]);
  });

  it("keeps quote names safe to transclude", async () => {
    const quoted = annotation();
    const paths = await annotationPathCandidates("{{ quote }}", {
      ...quoted,
      target: { ...quoted.target, quote: { exact: "C# uses [[links]] and ^blocks" } },
    });
    expect(paths[0]).toBe("annotations/C uses links and blocks.md");
    for (const path of paths) {
      expect(path).not.toMatch(/[#^[\]|]/u);
    }
  });

  it("falls back to the ID when the template is unusable", async () => {
    const preview = await annotationNamePreview("{{ quote | nope }}", annotation());
    expect(preview.paths).toEqual(["annotations/ann_0011223344556677.md"]);
    expect(preview.usedDefault).toBe(true);
    expect(preview.problem).toMatch(/Unknown filter/u);
  });
});

function annotation(): Annotation {
  return {
    id: annotationId("ann_0011223344556677"),
    collectionId: collectionId("collection"),
    sourceId: sourceId("src_0123456789abcdef"),
    source: "[[sources/attention|Attention Is All You Need]]",
    annotationType: "highlight",
    color: "yellow",
    tags: [],
    body: "",
    createdAt: dateTime("2026-10-02T10:00:00.000Z"),
    target: {
      quote: { exact: "The dominant sequence transduction models are based on" },
      pdf: {
        pageIndex: 2,
        coordinateSpace: { profile: "pdf", box: "crop", origin: "bottom_left" },
        quadPoints: [],
      },
    },
  };
}
