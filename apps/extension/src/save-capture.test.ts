// @vitest-environment happy-dom
import { sourceId } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { CaptureWriter } from "./save-capture.js";
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
  it("only scans old uploads after an interrupted import, including after reopening", async () => {
    const f = fixture();
    f.commit.mockRejectedValueOnce(new Error("Upload interrupted"));
    await expect(f.save({ highlight: false })).rejects.toThrow("Upload interrupted");
    expect(f.commit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ recoverExistingFiles: false }),
    );
    const reopened = new CaptureWriter(f.storage);
    await reopened.save({
      session: f.session,
      collection: f.collection,
      capture,
      draft: { ...draft, highlight: false },
      onSource: f.onSource,
      onProgress: vi.fn(),
    });
    expect(f.commit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ recoverExistingFiles: true }),
    );
    expect(
      await f.storage.get(`capture-import:${f.collection.collectionId}:${capture.canonicalUrl}`),
    ).toBeNull();
  });
  it("recovers a committed source after the response is lost and the panel is reopened", async () => {
    const f = fixture();
    const commit = f.commit.getMockImplementation();
    if (!commit) {
      throw new Error("Missing fixture commit");
    }
    f.commit.mockImplementationOnce(async (plan) => {
      await commit(plan);
      throw new Error("Response lost after commit");
    });
    await expect(f.save({ highlight: false })).rejects.toThrow("Response lost");
    const reopened = new CaptureWriter(f.storage);
    const recovered = await reopened.save({
      session: f.session,
      collection: f.collection,
      capture,
      draft: { ...draft, highlight: false },
      onSource: f.onSource,
      onProgress: vi.fn(),
    });
    expect(recovered.existing).toBe(true);
    expect(recovered.source.title).toBe(draft.title);
    expect(
      (await f.collection.sources.get(f.collection.collectionId, recovered.source.id))?.body,
    ).toContain(draft.note);
    expect(
      await f.storage.get(`capture-import:${f.collection.collectionId}:${capture.canonicalUrl}`),
    ).toBeNull();
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.create).not.toHaveBeenCalled();
  });
});

describe("saved source and annotation retries", () => {
  it("fails closed on corrupted persistent highlight identities", async () => {
    const f = fixture();
    await f.save({ highlight: false });
    const get = f.storage.get;
    vi.spyOn(f.storage, "get").mockImplementation((key) =>
      key.startsWith("capture-annotation:") ? Promise.resolve('{"id":"","mutation":""}') : get(key),
    );
    await expect(f.save()).rejects.toThrow("recovery identity is invalid");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("does not adopt an uncertain highlight that was subsequently moved to another source", async () => {
    const f = fixture();
    f.create.mockImplementationOnce((annotation) => {
      f.annotations.set(annotation.id, { ...annotation, sourceId: sourceId("another-source") });
      return Promise.reject(new Error("Response lost"));
    });
    await expect(f.save()).rejects.toThrow("Response lost");
    const reopened = new CaptureWriter(f.storage);
    await expect(
      reopened.save({
        session: f.session,
        collection: f.collection,
        capture,
        draft,
        onSource: f.onSource,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("different source");
    expect(f.create).toHaveBeenCalledOnce();
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
    const reopened = new CaptureWriter(f.storage);
    const result = await reopened.save({
      session: f.session,
      collection: f.collection,
      capture,
      draft,
      onSource: f.onSource,
      onProgress: vi.fn(),
    });
    expect(result.annotation).not.toBeNull();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
  });
});
