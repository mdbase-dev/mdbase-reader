import { describe, expect, it } from "vitest";

import { validateCslItem } from "./citation.js";

describe("CSL item validation", () => {
  it("accepts and preserves a complete nested CSL item", () => {
    const item = {
      id: "dostoevsky2002crime",
      type: "book",
      title: "Crime and Punishment",
      author: [{ family: "Dostoevsky", given: "Fyodor" }],
      issued: { "date-parts": [[2002]] },
      custom: { metadataSource: "reviewed" },
    };

    expect(validateCslItem(item)).toEqual({ valid: true, item });
  });

  it("reports invalid citekeys, types, nested values, and extension placement", () => {
    const result = validateCslItem({
      id: "bad key",
      type: "novel",
      author: [{ family: 42 }],
      issued: { "date-parts": [[]] },
      reader_hint: "outside custom",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.problems.map(({ path }) => path)).toEqual([
        "csl.id",
        "csl.type",
        "csl.author[0].family",
        "csl.issued.date-parts[0]",
        "csl.reader_hint",
      ]);
    }
  });

  it("rejects arrays because a source contains one CSL item", () => {
    expect(validateCslItem([{ id: "one", type: "book" }])).toEqual({
      valid: false,
      problems: [{ path: "csl", message: "must be one CSL object" }],
    });
  });
});
