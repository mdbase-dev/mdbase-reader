// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes queued React effects */
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { SourcePartCreation, useSourcePartCreation } from "./SourcePartCreation.js";

import type * as ChapterOutlineModule from "./chapter-outline.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

vi.mock("./chapter-outline.js", async (original) => ({
  ...(await original<typeof ChapterOutlineModule>()),
  readChapterOutline: () =>
    Promise.resolve({
      pageCount: 10,
      proposals: [
        {
          key: "stable",
          title: "Outline chapter",
          level: 0,
          range: { kind: "pages", start: 1, end: 9 },
        },
      ],
    }),
}));

const book = partSource("book");
function Launcher(): JSX.Element {
  const open = useSourcePartCreation();
  return (
    <button type="button" onClick={() => open?.(book)}>
      Add chapters
    </button>
  );
}

it("creates nothing during preview or cancel, restores focus, and creates only after explicit confirmation", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const createSourcePart = vi.fn().mockResolvedValue(partSource("created", "book"));
  const gateway = {
    source: vi.fn().mockResolvedValue(book),
    library: vi.fn().mockResolvedValue({ sources: [book] }),
    createSourcePart,
  } as unknown as ReaderWorkspaceGateway;
  await act(async () => {
    root.render(
      <SourcePartCreation gateway={gateway} onCreated={vi.fn()}>
        <Launcher />
      </SourcePartCreation>,
    );
  });
  const launch = host.querySelector("button");
  launch?.focus();
  await act(async () => {
    launch?.click();
  });
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(createSourcePart).not.toHaveBeenCalled();
  const cancel = (): HTMLButtonElement | undefined =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
  await act(async () => {
    cancel()?.click();
  });
  expect(createSourcePart).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(launch);
  await act(async () => {
    launch?.click();
  });
  await act(async () => {
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
  });
  expect(createSourcePart).not.toHaveBeenCalled();
  await act(async () => {
    host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  });
  expect(createSourcePart).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: "Outline chapter",
      document: expect.objectContaining({
        fileId: book.documents[0]?.fileId,
        range: { kind: "pages", start: 1, end: 9 },
      }),
    }),
  );
  expect(host.querySelector("dialog")).toBeNull();
  act(() => root.unmount());
  host.remove();
});

describe("write UI rollout gate", () => {
  it("does not expose creation when disabled", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const gateway = { createSourcePart: vi.fn() } as unknown as ReaderWorkspaceGateway;
    await act(async () => {
      root.render(
        <SourcePartCreation enabled={false} gateway={gateway} onCreated={vi.fn()}>
          <Launcher />
        </SourcePartCreation>,
      );
    });
    await act(async () => {
      host.querySelector("button")?.click();
    });
    expect(host.querySelector("dialog")).toBeNull();
    act(() => root.unmount());
  });
});
