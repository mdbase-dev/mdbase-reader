// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

vi.mock("@mdbase-dev/ui/mark-activity", () => ({ signalMdbaseMark: vi.fn() }));

const citation = { id: "example2026", type: "article", title: "Original" };
const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_one"),
  path: "sources/one.md",
  title: "One",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  frontmatter: { csl: citation },
  citation,
};
const saveSourceCitation = vi.fn<ReaderWorkspaceGateway["saveSourceCitation"]>();
const gateway = { saveSourceCitation } as unknown as ReaderWorkspaceGateway;
let root: Root;
let controller: CitationEditorController;

function Harness({ source }: { source: Source }): null {
  const current = useCitationEditor({ gateway, source, onSaved: vi.fn() });
  useEffect(() => {
    controller = current;
  }, [current]);
  return null;
}

async function render(source: Source): Promise<void> {
  await act(async () => {
    root.render(<Harness source={source} />);
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  saveSourceCitation.mockReset();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe("citation editor save baseline", () => {
  it("keeps the draft's loaded citation when other writes refresh the source", async () => {
    const edited = { ...citation, title: "Reader edit" };
    saveSourceCitation.mockResolvedValue({ ...source, citation: edited });
    await render(source);
    await act(async () => controller.setCitation(edited));
    await render({
      ...source,
      recordRevision: recordRevision("rev-two"),
      citation: { ...citation, title: "Outside edit" },
    });
    await act(async () => controller.save());

    expect(saveSourceCitation).toHaveBeenCalledExactlyOnceWith(source, edited);
  });

  it("advances the baseline after an explicit successful save", async () => {
    const edited = { ...citation, title: "First edit" };
    const updated = { ...source, citation: edited, frontmatter: { csl: edited } };
    saveSourceCitation.mockResolvedValue(updated);
    await render(source);
    await act(async () => controller.setCitation(edited));
    await act(async () => controller.save());
    await render(updated);
    const next = { ...citation, title: "Second edit" };
    await act(async () => controller.setCitation(next));
    await act(async () => controller.save());

    expect(saveSourceCitation).toHaveBeenLastCalledWith(updated, next);
  });
});
