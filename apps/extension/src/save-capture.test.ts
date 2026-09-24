// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { capture, draft, fixture } from "./testing/save-capture-fixture.js";

describe("explicit source and highlight saves", () => {
  it("saves title, tags and authored note, then anchors the highlight to verified stored bytes", async () => {
    const f = fixture();
    const result = await f.save();
    expect(result.source.title).toBe(draft.title);
    expect(result.source.tags).toEqual(["research", "test"]);
    expect(f.commit.mock.calls[0]?.[0].body).toContain("Keep **this note**.");
    expect(result.annotation).toMatchObject({
      annotationType: "highlight",
      color: "green",
      tags: ["method", "key"],
      target: { quote: { exact: "beta gamma" } },
      body: "> beta gamma\n\nA useful passage.",
    });
    expect(result.annotation?.document).toEqual(result.source.documents[0]);
    expect(f.read).toHaveBeenCalledWith(
      f.collection.collectionId,
      "[[files/reading.html]]",
      result.source.documents[0]?.revision,
    );
  });
  it("reuses existing sources without overwriting their notes, title or tags", async () => {
    const f = fixture();
    await f.save({ highlight: false });
    const result = await f.save({
      title: "Do not overwrite",
      note: "Do not overwrite",
      tags: "other",
    });
    expect(result.existing).toBe(true);
    expect(result.source.title).toBe(draft.title);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("keeps the source saved but refuses to fabricate a target for missing passages", async () => {
    const f = fixture();
    await expect(
      f.save({}, { ...capture, selection: { exact: "not in the article" } }),
    ).rejects.toThrow("highlight is not");
    expect(f.onSource).toHaveBeenCalledTimes(1);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("refuses a highlight if downloaded bytes do not match the source revision", async () => {
    const f = fixture();
    await f.save({ highlight: false });
    f.read.mockResolvedValue({
      path: "files/reading.html",
      mediaType: "text/html",
      bytes: new TextEncoder().encode("changed"),
    });
    await expect(f.save()).rejects.toThrow("document changed");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("recovers an unknown annotation result without duplicating the record", async () => {
    const f = fixture();
    f.create.mockImplementationOnce((annotation) => {
      f.annotations.set(annotation.id, annotation);
      return Promise.reject(new Error("Outcome unknown"));
    });
    await expect(f.save()).rejects.toThrow("Outcome unknown");
    const result = await f.save();
    expect(result.annotation).not.toBeNull();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
  });
});
