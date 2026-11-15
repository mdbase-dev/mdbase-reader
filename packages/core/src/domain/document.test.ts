import { describe, expect, it } from "vitest";

import { documentKey, documentPath, sameDocument } from "./document.js";
import { fileId } from "./identity.js";
import { fileRevision } from "./revision.js";

import type { DocumentTarget } from "./document.js";

describe("documentPath", () => {
  it.each([
    ["[[biblib/a/a.pdf|a]]", "biblib/a/a.pdf"],
    ["![[biblib/a/a.pdf]]", "biblib/a/a.pdf"],
    ["[[ files/book.epub#chapter-2 | Book ]]", "files/book.epub"],
    ["[Paper](files/my%20paper.pdf)", "files/my paper.pdf"],
    ['[Paper](files/paper.pdf "Title")', "files/paper.pdf"],
    ["[Paper](<files/my paper.pdf>)", "files/my paper.pdf"],
    ["![Scan](files/scan.pdf#page=2)", "files/scan.pdf"],
    ["files/page.html", "files/page.html"],
    ["./files/page.html", "files/page.html"],
    ["/files/page.html", "files/page.html"],
  ])("reads %s as %s", (file, path) => {
    expect(documentPath(file)).toBe(path);
  });
});

describe("sameDocument", () => {
  it("matches the same file written as different links", () => {
    expect(sameDocument({ file: "[[biblib/A/A.pdf|A]]" }, { file: "[A](biblib/a/a.pdf)" })).toBe(
      true,
    );
    expect(sameDocument({ file: "[[files/x.pdf]]" }, { file: "files/x.pdf" })).toBe(true);
  });

  it("matches documents whatever their recorded file IDs", () => {
    const recorded: DocumentTarget = {
      file: "[[files/x.pdf]]",
      fileId: fileId("01a1bea5-149d-77a7-b8d4-7c91c2da0783"),
      revision: fileRevision("sha256:abcdef"),
    };
    const reassigned: DocumentTarget = {
      ...recorded,
      fileId: fileId("01a1bea5-149d-77a7-b8d4-7c91c2da0784"),
    };
    expect(sameDocument(recorded, reassigned)).toBe(true);
  });

  it("tells different files apart", () => {
    expect(sameDocument({ file: "[[files/x.pdf]]" }, { file: "[[files/y.pdf]]" })).toBe(false);
  });

  it("matches nothing that names no file", () => {
    expect(sameDocument({ file: "" }, { file: "" })).toBe(false);
    expect(sameDocument({ file: "[[]]" }, { file: "[[]]" })).toBe(false);
    expect(
      sameDocument({ file: "https://example.com/x.pdf" }, { file: "https://example.com/x.pdf" }),
    ).toBe(false);
    expect(sameDocument({ file: "[x](#top)" }, { file: "[x](#top)" })).toBe(false);
    expect(sameDocument(undefined, { file: "[[files/x.pdf]]" })).toBe(false);
  });
});

describe("documentKey", () => {
  it("folds case and Unicode normalization", () => {
    expect(documentKey({ file: "[[Files/Café.pdf]]" })).toBe(
      documentKey({ file: "files/café.pdf" }),
    );
  });
});
