import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";

it("recovers text edits and isolates collections, sources, and document revisions", async () => {
  const store = await import("./annotation-drafts.js");
  const key = store.annotationDraftKey("draft-test", "source", "annotation");
  store.saveAnnotationDraft(key, { body: "Unfinished comment", baseBody: "Original" });
  await vi.waitFor(() => expect(store.annotationDraftSnapshot(key).saved).toBe(true));
  expect(store.hasAnnotationDrafts("draft-test", "source")).toBe(true);
  expect(store.hasAnnotationDrafts("other-collection", "source")).toBe(false);
  vi.resetModules();
  const reloaded = await import("./annotation-drafts.js");
  await reloaded.loadAnnotationDraft(key);
  expect(reloaded.annotationDraftSnapshot(key).value).toEqual({
    body: "Unfinished comment",
    baseBody: "Original",
  });
});
it("preserves PDF area image blobs across reload", async () => {
  const store = await import("./annotation-drafts.js");
  const key = store.annotationDraftKey("draft-test", "source", "pdf-revision");
  store.saveAnnotationDraft(key, {
    body: "Area comment",
    selection: {
      kind: "area",
      value: {
        pageIndex: 1,
        rect: { x: 1, y: 2, width: 20, height: 30 },
        coordinateProfile: "test",
        image: new Blob(["test-image"], { type: "image/png" }),
        imageType: "image/png",
        scale: 1,
        withAnnotations: false,
      },
    },
  });
  await vi.waitFor(() => expect(store.annotationDraftSnapshot(key).saved).toBe(true));
  vi.resetModules();
  const reloaded = await import("./annotation-drafts.js");
  await reloaded.loadAnnotationDraft(key);
  const selection = reloaded.annotationDraftSnapshot(key).value?.selection;
  expect(selection?.kind).toBe("area");
  if (selection?.kind === "area") {
    expect(await selection.value.image.text()).toBe("test-image");
  }
});
it("never resurrects an older draft after a newer edit or removal", async () => {
  const store = await import("./annotation-drafts.js");
  const key = store.annotationDraftKey("draft-test", "race", "annotation");
  const loading = store.loadAnnotationDraft(key);
  store.saveAnnotationDraft(key, { body: "One" });
  store.saveAnnotationDraft(key, { body: "Two" });
  store.saveAnnotationDraft(key, null);
  await loading;
  await vi.waitFor(() => expect(store.annotationDraftSnapshot(key).saved).toBe(true));
  vi.resetModules();
  const reloaded = await import("./annotation-drafts.js");
  await reloaded.loadAnnotationDraft(key);
  expect(reloaded.annotationDraftSnapshot(key).value).toBeNull();
});
it("keeps the in-memory draft and exposes storage failure", async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new Error("Quota unavailable");
    },
  });
  const store = await import("./annotation-drafts.js");
  store.saveAnnotationDraft("failure", { body: "Do not lose me" });
  await vi.waitFor(() =>
    expect(store.annotationDraftSnapshot("failure").problem).toContain("Could not save"),
  );
  expect(store.annotationDraftSnapshot("failure").value?.body).toBe("Do not lose me");
  vi.unstubAllGlobals();
  vi.resetModules();
});
