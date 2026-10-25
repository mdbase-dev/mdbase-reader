import { describe, expect, it, vi } from "vitest";

import {
  annotationLeaves,
  annotationPaths,
  areaCapturePaths,
  authorYearFromCsl,
  firstFreePath,
  idSuffix,
  isReservedName,
  maxNameBytes,
  nameClusters,
  nameWithSuffix,
  pathKey,
  quoteWords,
  slug,
  sourceFilePaths,
  sourceFolderNames,
  sourceNoteNames,
  sourceNotePaths,
  sourceNoteStems,
  utf8Bytes,
} from "./record-names.js";

import type { AnnotationNameInput } from "./record-names.js";
import type { AnnotationTarget, PdfSelector } from "./selector.js";

const sourceId = "src_3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const annotationId = "ann_0b6e1d2c-3a4b-4c5d-8e6f-77d29f417c2e";
const transferId = "83dd2f80-c7da-44d7-9844-6ea755a05f40";

/**
 * A port of the per-segment rules of the engine's `check_path` (mdbase
 * `crates/core/src/paths.rs`), written from the Rust rather than from `isReservedName`, so that
 * the property tests catch a name the engine would refuse. The reason, or undefined when allowed.
 */
function engineSegmentViolation(segment: string): string | undefined {
  if (segment === "") {
    return "empty";
  }
  if (segment === "." || segment === "..") {
    return "dot_segment";
  }
  if (new TextEncoder().encode(segment).length > 255) {
    return "segment_too_long";
  }
  for (const character of segment) {
    const violation = engineCharacterViolation(character);
    if (violation) {
      return violation;
    }
  }
  if (segment.endsWith(".") || segment.endsWith(" ")) {
    return "trailing_dot_or_space";
  }
  if (engineReservedDevice(segment)) {
    return "reserved_name";
  }
  if (engineShortName(segment)) {
    return "short_name_alias";
  }
  if (engineReservedEq(segment, ".mdbase")) {
    return "private_namespace";
  }
  if (segment.startsWith(".")) {
    return "hidden_path";
  }
  return engineReservedEq(segment, "node_modules") ? "dependency_path" : undefined;
}

function engineCharacterViolation(character: string): string | undefined {
  const point = character.codePointAt(0) ?? 0;
  if (character === "\\" || character === "/") {
    return "separator";
  }
  if ('<>:"|?*'.includes(character)) {
    return "forbidden_character";
  }
  // Rust's char::is_control: general category Cc.
  if (point < 0x20 || (point >= 0x7f && point <= 0x9f)) {
    return "control_character";
  }
  const ignorable: readonly (readonly [number, number])[] = [
    [0xad, 0xad],
    [0x34f, 0x34f],
    [0x115f, 0x1160],
    [0x17b4, 0x17b5],
    [0x180b, 0x180f],
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x206f],
    [0x3164, 0x3164],
    [0xfe00, 0xfe0f],
    [0xfeff, 0xfeff],
    [0xffa0, 0xffa0],
    [0xfff0, 0xfff8],
    [0x1bca0, 0x1bca3],
    [0x1d173, 0x1d17a],
    [0xe0000, 0xe0fff],
  ];
  if (ignorable.some(([low, high]) => point >= low && point <= high)) {
    return "ignorable_character";
  }
  return undefined;
}

/** `is_reserved_device`: the stem before the first `.`, trailing spaces removed, ASCII case. */
function engineReservedDevice(segment: string): boolean {
  const upper = (text: string): string => text.replace(/[a-z]/gu, (c) => c.toUpperCase());
  let stem = segment.split(".")[0] ?? "";
  while (stem.endsWith(" ")) {
    stem = stem.slice(0, -1);
  }
  if (new TextEncoder().encode(stem).length > 7) {
    return false;
  }
  if (["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$", "CLOCK$"].includes(upper(stem))) {
    return true;
  }
  const characters = Array.from(stem);
  const prefix = upper(characters.slice(0, 3).join(""));
  const rest = characters.slice(3);
  return (
    (prefix === "COM" || prefix === "LPT") &&
    rest.length === 1 &&
    "0123456789¹²³".includes(rest[0] ?? "")
  );
}

/** `is_short_name`. */
function engineShortName(segment: string): boolean {
  const lastDot = segment.lastIndexOf(".");
  const [name, extension] =
    lastDot > 0 ? [segment.slice(0, lastDot), segment.slice(lastDot + 1)] : [segment, undefined];
  if (extension !== undefined && Array.from(extension).length > 3) {
    return false;
  }
  const tilde = name.lastIndexOf("~");
  if (tilde < 0) {
    return false;
  }
  const baseLength = Array.from(name.slice(0, tilde)).length;
  const number = name.slice(tilde + 1);
  return (
    baseLength >= 1 &&
    baseLength <= 6 &&
    number.length >= 1 &&
    number.length <= 6 &&
    /^[0-9]+$/u.test(number) &&
    !number.startsWith("0")
  );
}

/** `reserved_name_eq`: ASCII case, plus U+017F long s and U+212A Kelvin sign. */
function engineReservedEq(text: string, reserved: string): boolean {
  const folded = Array.from(text, (c) => {
    const point = c.codePointAt(0);
    return point === 0x17f
      ? "s"
      : point === 0x212a
        ? "k"
        : c.replace(/[A-Z]/u, (l) => l.toLowerCase());
  });
  return folded.join("") === reserved;
}

/** Every segment of `path` passes the engine's check. */
function expectEngineAccepts(path: string): void {
  for (const segment of path.split("/")) {
    expect([segment, engineSegmentViolation(segment)]).toEqual([segment, undefined]);
  }
}

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
    // Characters the engine refuses as ignorable are dropped, even letters and marks.
    ["a\u034fb", "ab"],
    ["a\u17b4b\u17b5", "ab"],
    ["\u115fx\u1160y", "xy"],
    ["x\u3164y x\uffa0y", "xy-xy"],
    ["hyph\u00adenation", "hyphenation"],
    ["word\u2060joiner", "wordjoiner"],
    ["a\ufeffb", "ab"],
    ["mo\u{e0067}x", "mox"],
    // Persian's zero-width non-joiner separates words.
    ["می\u200cخواهم", "می-خواهم"],
    // An Arabic number sign does not take its digits with it.
    ["\u0600123 \u0601٢٣", "123-٢٣"],
    // Locale-independent lowercasing: `I` is `i` in every locale, and `ı` stays dotless.
    ["TITLE IN TURKISH", "title-in-turkish"],
    ["DİYARBAKIR ılık", "di\u0307yarbakir-ılık"],
    ["ĮSTATYMAS Ì", "įstatymas-ì"],
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
});

describe("slug truncation", () => {
  it("loads and names without Intl.Segmenter", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    Reflect.deleteProperty(Intl, "Segmenter");
    try {
      vi.resetModules();
      const fresh = await import("./record-names.js");
      expect(fresh.slug("नमस्ते व्याकरण", 8)).toBe("नमस्ते");
      expect(fresh.quoteWords("我们提出了一种用于随机目标函数的一阶梯度优化算法")).toBe(
        "我们提出了一种用于随机目标函数的",
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(Intl, "Segmenter", descriptor);
      }
    }
  });

  it("cuts at the same place on every runtime", () => {
    // Never after a virama: स्ते is one unit, whatever the ICU version's conjunct rules.
    expect(slug("नमस्ते", 3)).toBe("नम");
    expect(slug("नमस्ते", 6)).toBe("नमस्ते");
    expect(slug("한국어", 2)).toBe("한국");
    expect(nameClusters("🇦🇺🇳🇿👍🏽👨\u200d👩\u200d👧क्षिq\u0301각각x")).toEqual([
      "🇦🇺",
      "🇳🇿",
      "👍🏽",
      "👨\u200d👩\u200d👧",
      "क्षि",
      "q\u0301",
      "각",
      "각",
      "x",
    ]);
    expect(nameClusters("a\ufe0fb\u200ccำ")).toEqual(["a\ufe0f", "b\u200c", "cำ"]);
    expect(nameClusters("🇦🇺🇳")).toEqual(["🇦🇺", "🇳"]);
  });

  it("truncates within the code-point limit without splitting a character from its marks", () => {
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

// Characters for the property tests, including everything that gave trouble before.
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
  "\u0085",
  "\u009f",
  "\t",
  "\n",
  "~",
  "$",
  // Everything the engine refuses as ignorable, and what NFKC turns into it.
  "\u00ad",
  "\u034f",
  "\u115f",
  "\u1160",
  "\u17b4",
  "\u17b5",
  "\u180b",
  "\u180e",
  "\u200c",
  "\u200e",
  "\u2060",
  "\u2066",
  "\u206f",
  "\u3164",
  "\ufe00",
  "\ufeff",
  "\uffa0",
  "\ufff0",
  "\u{1bca0}",
  "\u{1d173}",
  "\u{e0001}",
  "\u{e0067}",
  "\u{e0100}",
  // Prepended number signs, Hangul jamo, regional indicators.
  "\u0600",
  "٢",
  "ᆨ",
  "🇦",
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

describe("slug properties", () => {
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
          if (!isReservedName(name)) {
            expectEngineAccepts(name);
          }
        }
      }
    }
  });

  it("agrees with the engine's check on any name", () => {
    for (const input of samples(4_000)) {
      for (const name of [input, input.slice(0, 8), input.trim()]) {
        expect([name, isReservedName(name)]).toEqual([
          name,
          engineSegmentViolation(name) !== undefined,
        ]);
      }
    }
  });

  it("only ever generates paths the engine accepts", () => {
    let index = 0;
    for (const input of samples(600)) {
      index += 1;
      const id = `src_${String(index).padStart(8, "0")}-0000-4000-8000-${String(input.length)}`;
      const names = sourceNoteNames({
        title: input,
        id,
        authorYear: { family: input.slice(3, 20), year: 2000 + (index % 30) },
      });
      for (const { stem, path, folder } of names) {
        expectEngineAccepts(path);
        expect(utf8Bytes(stem)).toBeLessThanOrEqual(stem === id ? 255 : maxNameBytes);
        for (const candidate of sourceFolderNames(stem, id)) {
          expectEngineAccepts(candidate);
        }
        expect(sourceFolderNames(stem, id)[0]).toBe(folder);
      }
      for (const folder of sourceFolderNames(input, id)) {
        expectEngineAccepts(folder);
      }
      const folder = names[0]?.folder ?? id;
      const leaves = annotationLeaves({
        id: annotationId,
        annotationType: "highlight",
        target: { quote: { exact: input }, pdf: pdf(index) },
      });
      for (const path of annotationPaths({
        id: annotationId,
        annotationType: "note",
        body: input,
        sourceFolder: folder,
      })) {
        expectEngineAccepts(path);
      }
      for (const path of [
        ...sourceFilePaths({
          sourceFolder: folder,
          role: "alternative",
          extension: input.slice(0, 5),
          transferId,
          originalName: input,
        }),
        ...areaCapturePaths({ sourceFolder: folder, annotationLeaf: leaves[0] ?? "", transferId }),
      ]) {
        expectEngineAccepts(path);
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
    // What else the engine's check_path refuses in one segment.
    "conin$",
    "CONOUT$",
    "CONOUT$   .md",
    "clock$.txt",
    "AUX .md",
    "git~1",
    "GIT~1",
    "mdbase~2.txt",
    "obsidi~1",
    "node_modules",
    "Node_Modules",
    "node_moduleſ",
    ".mdbase",
    ".mdbaſe",
    "a\u0085b",
    "a\u009fb",
    "a\u00adb",
    "a\u034fb",
    "\u115f",
    "x\u3164",
    "a\u200bb",
    "\u200c.git",
    "a\ufe0f",
    "a\ufeffb",
    "a\u{e0001}",
    "a".repeat(256),
    "a\u0000b",
    "a\u001fb",
    "a\u007fb",
  ])("refuses %j", (name) => {
    expect(isReservedName(name)).toBe(true);
    expect(engineSegmentViolation(name)).toBeDefined();
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
    "notes~",
    "~1.md",
    "draft~01.md",
    "toolongname~1",
    "git~1.html",
    "com10.md",
    "conin",
    "clock",
    "node_modules2",
    "a".repeat(255),
    "😀 emoji.md",
    // The engine compares device names in ASCII case only.
    "CLOC\u212a$",
  ])("accepts %j", (name) => {
    expect(isReservedName(name)).toBe(false);
    expect(engineSegmentViolation(name)).toBeUndefined();
  });

  it.each([...Array.from('<>:"|?*\\/'), "\u0000", "\u007f", "\u0085", "\u200d", "\ufe0f"])(
    "agrees with the engine on %j",
    (character) => {
      expect(isReservedName(`a${character}b`)).toBe(true);
      expect(engineSegmentViolation(`a${character}b`)).toBeDefined();
    },
  );
});

describe("nameWithSuffix", () => {
  it("cuts the base only as far as the suffix needs", () => {
    expect(nameWithSuffix("adam", "-5a6b")).toBe("adam-5a6b");
    expect(nameWithSuffix("a".repeat(120), "-5a6b")).toBe(`${"a".repeat(115)}-5a6b`);
    expect(nameWithSuffix(`${"漢".repeat(38)}-x`, "-3e4f5a6b")).toBe(`${"漢".repeat(37)}-3e4f5a6b`);
    expect(nameWithSuffix("", "-5a6b")).toBe("");
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

  it("folds as the engine's full case folding does", () => {
    // Keys from the engine's `path_key` (Unicode 17 CaseFolding.txt, statuses C and F).
    expect(pathKey("STRAẞE")).toBe("strasse");
    expect(pathKey("ẞ")).toBe(pathKey("ss"));
    expect(pathKey("ß")).toBe(pathKey("SS"));
    expect(pathKey("ı")).toBe("ı");
    expect(pathKey("ı")).not.toBe(pathKey("i"));
    expect(pathKey("ı")).not.toBe(pathKey("I"));
    expect(pathKey("İ")).toBe("i\u0307");
    expect(pathKey("İ")).not.toBe(pathKey("i"));
    expect(pathKey("ſ")).toBe("s");
    expect(pathKey("\u212a")).toBe("k");
    expect(pathKey("ﬁ")).toBe("fi");
    expect(pathKey("Σίσυφος")).toBe("σίσυφοσ");
    expect(pathKey("ΣΑΣ")).toBe(pathKey("σας"));
    expect(pathKey("µ")).toBe(pathKey("Μ"));
    expect(pathKey("ꭰ")).toBe(pathKey("Ꭰ"));
    expect(pathKey("ǅ")).toBe(pathKey("Ǆ"));
    expect(pathKey("日本")).toBe("日本");
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

describe("source folders", () => {
  it.each([
    ["adam-a-method", "adam-a-method"],
    ["Adam (Kingma 2014)", "adam-kingma-2014"],
    ["introduction-smith-2019", "introduction-smith-2019"],
    ["重力と恩寵", "重力と恩寵"],
    ["!!!", sourceId],
    ["con", "con-5a6b"],
    [sourceId, sourceId],
  ])("%j gives %j", (stem, expected) => {
    expect(sourceFolderNames(stem, sourceId)[0]).toBe(expected);
  });

  it("names a generated stem's folder as written, past 60 code points", () => {
    const title = "Attention Is All You Need: Transformers for Sequence Transduction Tasks";
    const names = sourceNoteNames({ title, id: sourceId });
    expect(names.map(({ stem }) => stem)).toEqual(sourceNoteStems({ title, id: sourceId }));
    expect(names.map(({ folder }) => folder)).toEqual(names.map(({ stem }) => stem));
    expect(names.map(({ path }) => path)).toEqual(sourceNotePaths({ title, id: sourceId }));
    const folders = names.map(({ stem }) => sourceFolderNames(stem, sourceId)[0]);
    expect(folders).toEqual(names.map(({ stem }) => stem));
    expect(new Set(folders.map((folder) => pathKey(folder ?? ""))).size).toBe(4);
  });

  it("names the folder of a source named by its ID with the ID", () => {
    expect(sourceNoteNames({ title: "", id: sourceId })).toEqual([
      { stem: sourceId, path: `sources/${sourceId}.md`, folder: sourceId },
    ]);
    expect(sourceFolderNames(sourceId, sourceId)).toEqual([sourceId]);
  });

  it("offers ID-suffixed folders when another source has the folder", () => {
    // A renamed `Adam!.md` and another source's `adam.md` both start from `adam`.
    expect(sourceFolderNames("Adam!", sourceId)).toEqual([
      "adam",
      "adam-5a6b",
      "adam-3e4f5a6b",
      sourceId,
    ]);
    const otherId = "src_00000000-0000-4000-8000-00000000beef";
    expect(sourceFolderNames("adam", otherId)).toEqual([
      "adam",
      "adam-beef",
      "adam-0000beef",
      otherId,
    ]);
    const taken = new Set([pathKey("adam")]);
    expect(sourceFolderNames("Adam!", sourceId).find((f) => !taken.has(pathKey(f)))).toBe(
      "adam-5a6b",
    );
  });

  it("lets a caller pick the first stem free for both the note and the folder", () => {
    const names = sourceNoteNames({ title: "Adam", id: sourceId });
    const takenPaths = new Set<string>();
    const takenFolders = new Set([pathKey("adam")]);
    const chosen = names.find(
      ({ path, folder }) => !takenPaths.has(pathKey(path)) && !takenFolders.has(pathKey(folder)),
    );
    expect(chosen).toEqual({
      stem: "adam-5a6b",
      path: "sources/adam-5a6b.md",
      folder: "adam-5a6b",
    });
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
    const thai = quoteWords("ภาษาไทยเป็นภาษาที่ไม่มีการเว้นวรรคระหว่างคำ");
    expect(thai).toBe("ภาษาไทยเป็นภาษาที่ไ");
    expect(nameClusters(thai)).toHaveLength(16);
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
        sourceFolder: "adam-kingma-2014",
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
      { sourceFolder: "adam", role: "primary", extension: "pdf", transferId },
      "files/reader/adam/adam.pdf",
    ],
    [
      "primary EPUB",
      { sourceFolder: "moby-dick", role: "primary", extension: ".EPUB", transferId },
      "files/reader/moby-dick/moby-dick.epub",
    ],
    [
      "web capture",
      { sourceFolder: "how-to-read", role: "primary", extension: "html", transferId },
      "files/reader/how-to-read/how-to-read.html",
    ],
    [
      "web archive",
      { sourceFolder: "how-to-read", role: "archive", extension: "html", transferId },
      "files/reader/how-to-read/how-to-read.archive.html",
    ],
    [
      "alternative attachment",
      {
        sourceFolder: "adam",
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
        sourceFolder: "adam",
        role: "alternative",
        extension: "pdf",
        transferId,
        originalName: "!!!.pdf",
      },
      "files/reader/adam/adam.pdf",
    ],
    [
      "source named by its ID",
      { sourceFolder: sourceId, role: "primary", extension: "pdf", transferId },
      `files/reader/${sourceId}/${sourceId}.pdf`,
    ],
  ])("%s", (_name, input, expected) => {
    expect(sourceFilePaths(input)[0]).toBe(expected);
  });

  it("falls back to the transfer ID before the extension", () => {
    expect(
      sourceFilePaths({
        sourceFolder: "how-to-read",
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
        sourceFolder: "optimization-methods",
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
      sourceFolder: "漢".repeat(40),
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
