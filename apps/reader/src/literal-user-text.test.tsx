// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { t } from "@lingui/core/macro";
import { collectionId, sourceId, type SourceSummary } from "@mdbase-reader/core";
import { readerI18n } from "@mdbase-reader/i18n";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryRowMenu } from "./LibraryRowMenu.js";
import { SourceAddDialog } from "./SourceAddDialog.js";
import { SourceRemovalDialog } from "./SourceRemovalDialog.js";
import { createRoot, renderToStaticMarkup } from "./testing/i18n.js";

import type { SourceAdditionController } from "./use-source-addition.js";
import type { SourceRemovalController } from "./use-source-removal.js";

const markup = "Notes <0/> <b>bold</b> <1>x</1>";

afterEach(async () => {
  await readerI18n.selectLocale("en");
});

describe("user text is rendered literally", () => {
  it("preserves literal backslash sequences in interpolated values", async () => {
    const path = String.raw`C:\x41dir\u0042\\`;
    expect(t`Remove “${path}”?`).toBe(`Remove “${path}”?`);
    await readerI18n.selectLocale("it");
    const italian = t`Remove “${path}”?`;
    expect(italian).toContain(path);
    // Encoding once is correct; a second app-side pass would show `\` as `\u005c`.
    const single = t`Remove “${"a\\b"}”?`;
    expect(single).toContain("a\\b");
    expect(single).not.toContain("u005c");
  });

  const source: SourceSummary = {
    collectionId: collectionId("c"),
    id: sourceId("src"),
    path: "sources/a.md",
    title: markup,
    creators: [],
    tags: [],
    documents: [],
  };

  it("shows a markup-shaped source title literally in the removal dialog", () => {
    const removal: SourceRemovalController = {
      request: null,
      pending: { source, status: "confirming", plan: null, problem: null },
      cancel: vi.fn(),
      confirm: vi.fn(),
    };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<SourceRemovalDialog removal={removal} />);
    expect(container.querySelector("h2")?.textContent).toBe(`Remove “${markup}”?`);
  });

  it("shows a markup-shaped page title literally in the citation-only offer", () => {
    const lookup = {
      progress: null,
      notice: null,
      offer: { reason: "<0/>", title: markup },
      saveCitationOnly: vi.fn(),
      openNoticed: vi.fn(),
    } as unknown as SourceAdditionController["lookup"];
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <SourceAddDialog
        open
        busy={false}
        error={null}
        canChooseFile={false}
        onClose={vi.fn()}
        onChooseFile={vi.fn()}
        onCapture={vi.fn()}
        onEdit={vi.fn()}
        onDropFile={vi.fn()}
        lookup={lookup}
      />,
    );
    expect(container.querySelector(".capture-follow-up p")?.textContent).toContain(
      `but it found the citation for “${markup}”`,
    );
    expect(container.querySelector(".capture-follow-up details")?.textContent).toContain("<0/>");
    expect(container.querySelector(".capture-follow-up details b")).toBeNull();
  });

  it("shows a markup-shaped citekey literally in the row menu", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const citekey = "key<0/><b>x</b>";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <LibraryRowMenu
            target={{
              source: { ...source, citation: { id: citekey, type: "book" } },
              x: 0,
              y: 0,
            }}
            actions={{ onOpen: vi.fn(), onOpenBeside: vi.fn() }}
            onClose={vi.fn()}
          />,
        ),
      );
      const kbd = [...document.querySelectorAll("kbd")].find((item) =>
        item.textContent.startsWith("@key"),
      );
      expect(kbd?.textContent).toBe(`@${citekey}`);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
