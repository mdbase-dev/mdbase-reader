import { describe, expect, it } from "vitest";

import {
  annotationLeaves,
  annotationPaths,
  areaCapturePaths,
  authorYearFromCsl,
  firstFreePath,
  idSuffix,
  isReservedName,
  maxNameBytes,
  pathKey,
  quoteWords,
  slug,
  sourceFilePaths,
  sourceFolderName,
  sourceNotePaths,
  sourceNoteStems,
  utf8Bytes,
} from "./record-names.js";

import type { AnnotationNameInput } from "./record-names.js";
import type { AnnotationTarget, PdfSelector } from "./selector.js";

const sourceId = "src_3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const annotationId = "ann_0b6e1d2c-3a4b-4c5d-8e6f-77d29f417c2e";
const transferId = "83dd2f80-c7da-44d7-9844-6ea755a05f40";

const graphemeCount = (text: string): number =>
  Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length;

describe("slug", () => {
  it.each([
    ["Crime and Punishment", "crime-and-punishment"],
    ["  --Hello,   World!--  ", "hello-world"],
    ["Dostoevsky’s notes", "dostoevskys-notes"],
    ["l'homme", "lhomme"],
    // NFKC: ligatures, full-width forms, superscripts and Roman numerals become plain letters.
    ["ﬁnal ﬂow", "final-flow"],
    ["ＡＢＣ\u3000１２３", "abc-123"],
    ["x² + y²", "x2-y2"],
    ["Chapter Ⅻ", "chapter-xii"],
    // Combining marks stay with their letter, whichever form the input is in.
    ["Cafe\u0301 Ole\u0301", "café-olé"],
    ["Café Olé", "café-olé"],
    ["हिन्दी व्याकरण", "हिन्दी-व्याकरण"],
    ["ภาษาไทย ง่าย", "ภาษาไทย-ง่าย"],
    ["Tiếng Việt", "tiếng-việt"],
    // CJK, Hangul and right-to-left scripts are kept, not transliterated.
    ["重力と恩寵", "重力と恩寵"],
    ["한국어 문법", "한국어-문법"],
    ["각", "각"],
    ["שלום עולם", "שלום-עולם"],
    ["مرحبا بالعالم", "مرحبا-بالعالم"],
    // Bidi controls and zero-width characters are separators, never part of a name.
    ["abc\u202etxt.exe", "abc-txt-exe"],
    ["\u200fשלום\u200e", "שלום"],
    ["zero\u200bwidth", "zero-width"],
    // Emoji are separators; their variation selectors and joiners do not survive alone.
    ["I ❤\ufe0f Paris", "i-paris"],
    ["👨\u200d👩\u200d👧 family", "family"],
    ["🚀🚀🚀", ""],
    // A stray leading mark has no letter to sit on.
    ["\u0301abc", "abc"],
    // Locale-independent lowercasing.
    ["TITLE IN TURKISH", "title-in-turkish"],
    ["İstanbul", "i\u0307stanbul"],
    ["STRASSE Straße", "strasse-straße"],
    ["", ""],
    ["!!!", ""],
    ["— … · •", ""],
    ["   ", ""],
    ["...", ""],
  ])("%j gives %j", (input, expected) => {
    expect(slug(input, 60)).toBe(expected);
  });

  it("truncates to whole graphemes within the code-point limit", () => {
    expect(slug("abcdef", 3)).toBe("abc");
    expect(slug("ab cdef", 3)).toBe("ab");
    // "q\u0301" has no composed form: one grapheme of two code points, dropped, not split.
    expect(slug("abq\u0301", 3)).toBe("ab");
    expect(slug("abq\u0301", 4)).toBe("abq\u0301");
    expect(slug("नमस्ते", 4)).toBe("नम");
  });

  it.each([
    ["ASCII", "a"],
    ["two-byte Greek", "α"],
    ["three-byte CJK", "漢"],
    ["four-byte supplementary", "𠀋"],
    ["Devanagari with marks", "क्षि"],
  ])("caps %s at %i bytes without splitting a code point", (_name, unit) => {
    const name = slug(unit.repeat(400), 1_000);
    expect(utf8Bytes(name)).toBeLessThanOrEqual(maxNameBytes);
    expect(utf8Bytes(name)).toBeGreaterThan(maxNameBytes - utf8Bytes(unit) - 1);
    expect(name).toBe(name.normalize("NFC"));
    expect(name.replaceAll(unit.normalize("NFC"), "")).toBe("");
  });

  it("emits NFC", () => {
    expect(slug("e\u0301", 10)).toBe("é");
    expect(slug("Å", 10)).toBe("å");
  });
});

describe("slug properties", () => {
  const pool = [
    ...Array.from("abcXYZ019 -_.'’,;:/\\|<>?*\""),
    "\u0301",
    "\u0308",
    "\u093f",
    "\u094d",
    "\u0e48",
    "\u200d",
    "\u200b",
    "\u202e",
    "\ufe0f",
    "ß",
    "İ",
    "ς",
    "Σ",
    "漢",
    "字",
    "한",
    "ᄀ",
    "ᅡ",
    "ש",
    "م",
    "क",
    "ภ",
    "𠀋",
    "😀",
    "👍🏽",
    "ﬁ",
    "Ⅻ",
    "²",
    "\u0000",
    "\u001f",
    "\t",
    "\n",
  ];
  // A small seeded generator stands in for a property-testing library.
  function* samples(count: number): Generator<string> {
    let seed = 0x2545f491;
    const next = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x1_0000_0000;
    };
    for (let index = 0; index < count; index += 1) {
      const length = Math.floor(next() * 80);
      yield Array.from({ length }, () => pool[Math.floor(next() * pool.length)]).join("");
    }
  }

  it("is always a usable, lowercase NFC name within its limits, and stable", () => {
    for (const input of samples(2_000)) {
      for (const limit of [1, 5, 16, 60, 500]) {
        const name = slug(input, limit);
        expect(Array.from(name).length).toBeLessThanOrEqual(limit);
        expect(utf8Bytes(name)).toBeLessThanOrEqual(maxNameBytes);
        expect(name).toBe(name.normalize("NFC"));
        expect(name).not.toMatch(/^-|-$|--/u);
        expect(name).not.toMatch(/[^\p{L}\p{M}\p{N}-]/u);
        expect(name).not.toMatch(/^\p{M}/u);
        expect(name.toLowerCase()).toBe(name);
        if (name) {
          expect(isReservedName(name)).toBe(/^(?:con|prn|aux|nul|com\d|lpt\d)$/u.test(name));
          expect(slug(name, limit)).toBe(name);
        }
      }
    }
  });
});

describe("isReservedName", () => {
  it.each([
    "",
    "con",
    "CON",
    "con.md",
    "Con.tar.gz",
    "prn",
    "aux",
    "nul",
    "com0",
    "com9",
    "lpt1",
    "LPT9.png",
    "com¹",
    "lpt²",
    "com³.md",
    "con .md",
    ".hidden",
    "..",
    "name.",
    "name ",
    "a<b",
    "a>b",
    "a:b",
    'a"b',
    "a/b",
    "a\\b",
    "a|b",
    "a?b",
    "a*b",
    "a\u0000b",
    "a\u001fb",
    "a\u007fb",
  ])("refuses %j", (name) => {
    expect(isReservedName(name)).toBe(true);
  });

  it.each([
    "console",
    "con-7c2e",
    "com10",
    "lpt",
    "nul1x",
    "auxiliary.md",
    "my.con",
    "a b",
    "café",
  ])("accepts %j", (name) => {
    expect(isReservedName(name)).toBe(false);
  });
});

describe("idSuffix", () => {
  it("takes the random end of the record's own ID", () => {
    expect(idSuffix(sourceId, 4)).toBe("5a6b");
    expect(idSuffix(sourceId, 8)).toBe("3e4f5a6b");
    expect(idSuffix("ann_019A2B3C-4D5E-7F60-8A9B-0C1D2E3F4A5B", 4)).toBe("4a5b");
    expect(idSuffix("src_new", 8)).toBe("new");
    expect(idSuffix("src_", 4)).toBe("");
  });
});

describe("pathKey and firstFreePath", () => {
  it("treats names that differ in case or normalization as one", () => {
    expect(pathKey("sources/Adam.md")).toBe(pathKey("sources/adam.md"));
    expect(pathKey("sources/STRASSE.md")).toBe(pathKey("sources/straße.md"));
    expect(pathKey("sources/ΟΔΟΣ.md")).toBe(pathKey("sources/οδος.md"));
    expect(pathKey("sources/cafe\u0301.md")).toBe(pathKey("sources/Café.md"));
    expect(pathKey("sources/a.md")).not.toBe(pathKey("sources/b.md"));
  });

  it("skips candidates taken under any case", () => {
    const candidates = sourceNotePaths({ title: "Adam", id: sourceId });
    const taken = new Set([pathKey("sources/ADAM.md")]);
    expect(firstFreePath(candidates, taken)).toBe("sources/adam-5a6b.md");
    expect(firstFreePath(["x.md"], new Set([pathKey("X.md")]))).toBeUndefined();
  });

  it("never offers two candidates with one key", () => {
    const stems = sourceNoteStems({
      title: "Straße",
      id: "src_ss",
      authorYear: { family: "SS", year: 1 },
    });
    expect(new Set(stems.map(pathKey)).size).toBe(stems.length);
  });
});

describe("sourceNoteStems", () => {
  it("tries the title, title–author–year, then 4 and 8 ID characters, then the ID", () => {
    expect(
      sourceNoteStems({
        title: "Introduction",
        id: sourceId,
        authorYear: { family: "Smith", year: 2019 },
      }),
    ).toEqual([
      "introduction",
      "introduction-smith-2019",
      "introduction-5a6b",
      "introduction-3e4f5a6b",
      sourceId,
    ]);
  });

  it("leaves out the author–year name without both parts", () => {
    expect(
      sourceNoteStems({ title: "Intro", id: sourceId, authorYear: { family: "!!", year: 2019 } }),
    ).toEqual(["intro", "intro-5a6b", "intro-3e4f5a6b", sourceId]);
    expect(
      sourceNoteStems({
        title: "Intro",
        id: sourceId,
        authorYear: { family: "Smith", year: "n.d." },
      })[1],
    ).toBe("intro-5a6b");
  });

  it("shortens the title for the author–year name and the family name to 16", () => {
    const [, authorYear] = sourceNoteStems({
      title: "a".repeat(100),
      id: sourceId,
      authorYear: { family: "Wolfeschlegelsteinhausenbergerdorff", year: "2001-05" },
    });
    expect(authorYear).toBe(`${"a".repeat(48)}-wolfeschlegelste-2001`);
  });

  it("keeps every candidate within the byte cap, suffix included", () => {
    const stems = sourceNoteStems({
      title: "漢".repeat(100),
      id: sourceId,
      authorYear: { family: "𠀋".repeat(20), year: 2020 },
    });
    expect(stems).toHaveLength(5);
    for (const stem of stems) {
      expect(utf8Bytes(stem)).toBeLessThanOrEqual(maxNameBytes);
    }
    expect(stems[0]).toBe("漢".repeat(40));
    expect(stems[2]).toBe(`${"漢".repeat(38)}-5a6b`);
  });

  it.each(["", "   ", "!!!", "🚀", "— …"])("uses only the ID for the title %j", (title) => {
    expect(
      sourceNoteStems({ title, id: sourceId, authorYear: { family: "Smith", year: 2019 } }),
    ).toEqual([sourceId]);
  });

  it("moves past reserved names", () => {
    expect(sourceNoteStems({ title: "NUL", id: sourceId })[0]).toBe("nul-5a6b");
    expect(sourceNoteStems({ title: "Com¹", id: sourceId })[0]).toBe("com1-5a6b");
  });

  it("builds paths under sources/", () => {
    expect(sourceNotePaths({ title: "Moby-Dick; or, The Whale", id: sourceId })[0]).toBe(
      "sources/moby-dick-or-the-whale.md",
    );
  });
});

describe("authorYearFromCsl", () => {
  it.each([
    [
      { author: [{ family: "Kingma", given: "D." }], issued: { "date-parts": [[2014, 12]] } },
      { family: "Kingma", year: "2014" },
    ],
    [
      { author: [{ literal: "World Health Organization" }], issued: { raw: "March 2020" } },
      { family: "World Health Organization", year: "2020" },
    ],
    [
      { editor: [{ family: "Smith" }], issued: { "date-parts": [["2019"]] } },
      { family: "Smith", year: "2019" },
    ],
    [
      { author: [], editor: [{ family: "Smith" }], issued: { literal: "2019" } },
      { family: "Smith", year: "2019" },
    ],
    [{ author: [{ family: "Kingma" }] }, undefined],
    [{ issued: { "date-parts": [[2014]] } }, undefined],
    [{ author: [{ family: 42 }], issued: { "date-parts": [[2014]] } }, undefined],
    [{ author: [{ family: "Kingma" }], issued: { "date-parts": [[]] } }, undefined],
  ])("reads %j", (csl, expected) => {
    expect(authorYearFromCsl(csl)).toEqual(expected);
  });
});

describe("sourceFolderName", () => {
  it.each([
    ["adam-a-method", "adam-a-method"],
    ["Adam (Kingma 2014)", "adam-kingma-2014"],
    ["introduction-smith-2019", "introduction-smith-2019"],
    ["重力と恩寵", "重力と恩寵"],
    ["!!!", sourceId],
    ["con", sourceId],
  ])("%j gives %j", (stem, expected) => {
    expect(sourceFolderName(stem, sourceId)).toBe(expected);
  });
});

const pdf = (pageIndex: number): PdfSelector => ({
  pageIndex,
  coordinateSpace: { profile: "pdfjs", box: "crop", origin: "bottom_left" },
  quadPoints: [[0, 0, 1, 0, 1, 1, 0, 1]],
});

const leaf = (input: Omit<AnnotationNameInput, "id">): string | undefined =>
  annotationLeaves({ id: annotationId, ...input })[0];

describe("annotation names", () => {
  it.each<[string, Omit<AnnotationNameInput, "id">, string]>([
    [
      "PDF highlight",
      {
        annotationType: "highlight",
        target: {
          quote: { exact: "We propose Adam, a method for efficient stochastic optimization" },
          pdf: pdf(5),
        },
      },
      "p6-we-propose-adam-a-method-for",
    ],
    [
      "EPUB highlight",
      {
        annotationType: "highlight",
        target: {
          quote: { exact: "Call me Ishmael. Some years ago—never mind how long" },
          epub: { cfi: "/6/4" },
        },
      },
      "call-me-ishmael-some-years-ago",
    ],
    [
      "HTML highlight",
      {
        annotationType: "highlight",
        target: {
          quote: { exact: "The key is to read the paper three times." },
          html: { css: "p" },
        },
      },
      "the-key-is-to-read-the",
    ],
    [
      "PDF highlight with a comment",
      {
        annotationType: "note",
        target: { quote: { exact: "Learning is the process of" }, pdf: pdf(2) },
        body: "Ignored",
      },
      "p3-learning-is-the-process-of",
    ],
    [
      "PDF bookmark",
      { annotationType: "bookmark", target: { position: { kind: "pdf", pageIndex: 8 } } },
      "bookmark-p9",
    ],
    [
      "EPUB bookmark with a chapter title",
      {
        annotationType: "bookmark",
        target: {
          position: { kind: "epub", locator: { href: "c1.xhtml", title: "Chapter 1. Loomings" } },
        },
      },
      "bookmark-chapter-1-loomings",
    ],
    [
      "EPUB bookmark without a title",
      {
        annotationType: "bookmark",
        target: {
          position: {
            kind: "epub",
            locator: { href: "c1.xhtml", locations: { totalProgression: 0.123 } },
          },
        },
      },
      "bookmark-12pct",
    ],
    [
      "HTML bookmark",
      {
        annotationType: "bookmark",
        target: { position: { kind: "html", href: "https://example.com/", progression: 0.4 } },
      },
      "bookmark-40pct",
    ],
    [
      "bookmark with no position data",
      { annotationType: "bookmark", target: { position: { kind: "html", href: "x" } } },
      "bookmark",
    ],
    ["area capture", { annotationType: "area", target: { pdf: pdf(5) }, body: "" }, "p6-area"],
    [
      "area capture with a note",
      { annotationType: "area", target: { pdf: pdf(5) }, body: "Loss curves." },
      "p6-area-loss-curves",
    ],
    [
      "source comment",
      { annotationType: "note", body: "Useful for onboarding new readers to the team" },
      "note-useful-for-onboarding-new-readers-to",
    ],
    ["empty source comment", { annotationType: "note", body: "  " }, "note"],
    ["markdown-only comment", { annotationType: "note", body: "**—**" }, "note"],
    [
      "punctuation-only quote",
      { annotationType: "highlight", target: { quote: { exact: "…" }, pdf: pdf(0) } },
      "p1-highlight",
    ],
    [
      "unknown type",
      { annotationType: "Question", target: { quote: { exact: "Why does it converge?" } } },
      "question-why-does-it-converge",
    ],
    ["unknown type, nothing else", { annotationType: "!!" }, "annotation"],
  ])("%s", (_name, input, expected) => {
    expect(leaf(input)).toBe(expected);
  });
});

describe("quote words", () => {
  it("takes up to 6 words or 40 code points, whichever comes first", () => {
    expect(quoteWords("one two three four five six seven")).toBe("one-two-three-four-five-six");
    expect(quoteWords("internationalization considerations matter")).toBe(
      "internationalization-considerations",
    );
    expect(quoteWords("internationalization incomprehensibilities")).toBe("internationalization");
    expect(quoteWords("antidisestablishmentarianism-floccinaucinihilipilification")).toBe(
      "antidisestablishmentarianism",
    );
    expect(quoteWords("Pneumonoultramicroscopicsilicovolcanoconiosis!")).toBe(
      "pneumonoultramicroscopicsilicovolcanocon",
    );
    expect(quoteWords("a b")).toBe("a-b");
  });

  it("gives text written without spaces its first 16 graphemes", () => {
    expect(quoteWords("我们提出了一种用于随机目标函数的一阶梯度优化算法")).toBe(
      "我们提出了一种用于随机目标函数的",
    );
    expect(graphemeCount(quoteWords("ภาษาไทยเป็นภาษาที่ไม่มีการเว้นวรรคระหว่างคำ"))).toBe(16);
    expect(quoteWords("重力と恩寵、そして")).toBe("重力と恩寵-そして");
  });
});

describe("annotation leaves", () => {
  it("does not pad page numbers", () => {
    expect(
      leaf({ annotationType: "highlight", target: { quote: { exact: "x" }, pdf: pdf(140) } }),
    ).toBe("p141-x");
  });

  it("keeps the leaf to 64 code points and the byte cap before the suffix", () => {
    const target: AnnotationTarget = { quote: { exact: "𠀋".repeat(200) }, epub: { cfi: "/2" } };
    const leaves = annotationLeaves({ id: annotationId, annotationType: "highlight", target });
    for (const name of leaves) {
      expect(utf8Bytes(name)).toBeLessThanOrEqual(maxNameBytes);
    }
    expect(leaves.slice(1, 3)).toEqual([`${"𠀋".repeat(16)}-7c2e`, `${"𠀋".repeat(16)}-9f417c2e`]);
  });

  it("falls back to the annotation's ID suffix, then its ID", () => {
    expect(
      annotationPaths({
        id: annotationId,
        annotationType: "highlight",
        target: { quote: { exact: "We introduce Adam, an algorithm" }, pdf: pdf(0) },
        sourceStem: "Adam (Kingma 2014)",
        sourceId,
      }),
    ).toEqual([
      "annotations/adam-kingma-2014/p1-we-introduce-adam-an-algorithm.md",
      "annotations/adam-kingma-2014/p1-we-introduce-adam-an-algorithm-7c2e.md",
      "annotations/adam-kingma-2014/p1-we-introduce-adam-an-algorithm-9f417c2e.md",
      `annotations/adam-kingma-2014/${annotationId}.md`,
    ]);
  });

  it("moves past a reserved leaf", () => {
    expect(
      leaf({ annotationType: "highlight", target: { quote: { exact: "Con" }, html: {} } }),
    ).toBe("con-7c2e");
  });
});

describe("file names", () => {
  it.each<[string, Parameters<typeof sourceFilePaths>[0], string]>([
    [
      "primary PDF",
      { sourceStem: "adam", sourceId, role: "primary", extension: "pdf", transferId },
      "files/reader/adam/adam.pdf",
    ],
    [
      "primary EPUB",
      { sourceStem: "moby-dick", sourceId, role: "primary", extension: ".EPUB", transferId },
      "files/reader/moby-dick/moby-dick.epub",
    ],
    [
      "web capture",
      { sourceStem: "how-to-read", sourceId, role: "primary", extension: "html", transferId },
      "files/reader/how-to-read/how-to-read.html",
    ],
    [
      "web archive",
      { sourceStem: "how-to-read", sourceId, role: "archive", extension: "html", transferId },
      "files/reader/how-to-read/how-to-read.archive.html",
    ],
    [
      "alternative attachment",
      {
        sourceStem: "adam",
        sourceId,
        role: "alternative",
        extension: "pdf",
        transferId,
        originalName: "1412.6980v9 (Supplement).PDF",
      },
      "files/reader/adam/adam-1412-6980v9-supplement.pdf",
    ],
    [
      "alternative attachment without a usable name",
      {
        sourceStem: "adam",
        sourceId,
        role: "alternative",
        extension: "pdf",
        transferId,
        originalName: "!!!.pdf",
      },
      "files/reader/adam/adam.pdf",
    ],
    [
      "renamed source note",
      { sourceStem: "Adam (2014)", sourceId, role: "primary", extension: "pdf", transferId },
      "files/reader/adam-2014/adam-2014.pdf",
    ],
  ])("%s", (_name, input, expected) => {
    expect(sourceFilePaths(input)[0]).toBe(expected);
  });

  it("falls back to the transfer ID before the extension", () => {
    expect(
      sourceFilePaths({
        sourceStem: "how-to-read",
        sourceId,
        role: "archive",
        extension: "html",
        transferId,
      }),
    ).toEqual([
      "files/reader/how-to-read/how-to-read.archive.html",
      "files/reader/how-to-read/how-to-read-5f40.archive.html",
      "files/reader/how-to-read/how-to-read-55a05f40.archive.html",
    ]);
  });

  it("names an area capture after its annotation", () => {
    expect(
      areaCapturePaths({
        sourceStem: "optimization-methods",
        sourceId,
        annotationLeaf: "p44-area",
        transferId,
      }),
    ).toEqual([
      "files/reader/optimization-methods/p44-area.png",
      "files/reader/optimization-methods/p44-area-5f40.png",
      "files/reader/optimization-methods/p44-area-55a05f40.png",
    ]);
  });

  it("keeps an alternative attachment's stem within the byte cap", () => {
    const [path] = sourceFilePaths({
      sourceStem: "漢".repeat(40),
      sourceId,
      role: "alternative",
      extension: "pdf",
      transferId,
      originalName: `${"字".repeat(40)}.pdf`,
    });
    const name =
      path
        ?.split("/")
        .at(-1)
        ?.replace(/\.pdf$/u, "") ?? "";
    expect(utf8Bytes(name)).toBeLessThanOrEqual(maxNameBytes);
    expect(name).toMatch(/^漢+-字+$/u);
  });
});
