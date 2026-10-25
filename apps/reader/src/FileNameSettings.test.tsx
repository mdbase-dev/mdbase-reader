// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { nativeReaderCollection } from "@mdbase-reader/connect/native";
import { memoryConnection } from "@mdbase-reader/connect/testing";
import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { FileNameSettings } from "./FileNameSettings.js";

import type { ReaderSettingsStore } from "@mdbase-reader/connect";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

const settingsPath = "_settings/dev.mdbase.reader.md";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const closers: (() => void)[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const close of closers.splice(0)) {
    close();
  }
});

const source: SourceSummary = {
  collectionId: collectionId("reading"),
  id: sourceId("src_0123456789abcdef"),
  path: "sources/attention-is-all-you-need.md",
  title: "Attention Is All You Need",
  creators: ["Ashish Vaswani"],
  published: "2017",
  tags: [],
  documents: [],
};

const annotation: Annotation = {
  id: annotationId("ann_0011223344556677"),
  collectionId: collectionId("reading"),
  sourceId: source.id,
  source: "[[sources/attention-is-all-you-need|Attention Is All You Need]]",
  annotationType: "highlight",
  tags: [],
  body: "",
  createdAt: dateTime("2026-10-02T10:00:00.000Z"),
  target: { quote: { exact: "The dominant sequence transduction models" } },
};

async function open(seed?: Record<string, string | number>): Promise<{
  readonly settings: ReaderSettingsStore;
  readonly replica: Awaited<ReturnType<typeof memoryConnection>>["replica"];
  readonly connection: Awaited<ReturnType<typeof memoryConnection>>["connection"];
  readonly onDirtyChange: Mock<(dirty: boolean) => void>;
}> {
  const memory = await memoryConnection();
  closers.push(memory.close);
  if (seed) {
    memory.replica.seed({ path: settingsPath, types: ["reader-settings"], frontmatter: seed });
  }
  const collection = nativeReaderCollection(memory.connection);
  closers.push(() => collection.dispose());
  const settings = collection.settings;
  if (!settings) {
    throw new Error("A native collection has settings.");
  }
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  await act(async () =>
    root.render(
      <FileNameSettings
        settings={settings}
        sources={[source]}
        library={[source]}
        loadAnnotations={() => Promise.resolve([annotation])}
        onDirtyChange={onDirtyChange}
      />,
    ),
  );
  await settle();
  return { settings, replica: memory.replica, connection: memory.connection, onDirtyChange };
}

/** Let the store read and the async previews and checks finish. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

function input(label: string): HTMLInputElement {
  const found = host.ownerDocument.querySelector<HTMLInputElement>(
    `input[aria-label="${label} template"]`,
  );
  if (!found) {
    throw new Error(`Missing ${label}`);
  }
  return found;
}

function template(label: string): HTMLFieldSetElement {
  return input(label).closest("fieldset")!;
}

function previews(label: string): string[] {
  return [...template(label).querySelectorAll(".file-name-preview code")].map(
    (code) => code.textContent,
  );
}

async function type(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function button(name: string, within: ParentNode = host.ownerDocument): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  );
  if (!found) {
    throw new Error(`Missing button ${name}`);
  }
  return found;
}

describe("FileNameSettings", () => {
  it("shows the defaults and previews today's names for the user's own items", async () => {
    await open();
    expect(input("Source notes").value).toBe("{{ title | slug }}");
    expect(input("Annotations").value).toBe("{{ id }}");
    expect(previews("Source notes")).toEqual(["sources/attention-is-all-you-need.md"]);
    expect(previews("Annotations")).toEqual(["annotations/ann_0011223344556677.md"]);
    expect(host.ownerDocument.body.textContent).toContain("Changes only affect new items");
    expect(button("Save").disabled).toBe(true);
    expect(button("Reset to default", template("Source notes")).disabled).toBe(true);
  });

  it("previews a template as it is typed and saves it to the collection", async () => {
    const { settings, onDirtyChange } = await open();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await type(input("Source notes"), "{{ year }}/{{ author }} - {{ title }}");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(previews("Source notes")).toEqual([
      "sources/2017/Vaswani - Attention Is All You Need.md",
    ]);
    await type(input("Annotations"), "{{ words }}");
    expect(previews("Annotations")).toEqual(["annotations/the-dominant-sequence-transduction.md"]);

    await act(async () => button("Save").click());
    await settle();

    expect(settings.getSnapshot().frontmatter).toMatchObject({
      source_name_template: "{{ year }}/{{ author }} - {{ title }}",
      annotation_name_template: "{{ words }}",
    });
    expect(host.ownerDocument.body.textContent).toContain("Saved.");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("shows an invalid template's problem inline and will not save it", async () => {
    await open();
    await type(input("Source notes"), "{{ title | shout }}");
    const problem = template("Source notes").querySelector(".file-name-template-problem");
    expect(problem?.textContent).toMatch(/Unknown filter "shout"/u);
    expect(input("Source notes").getAttribute("aria-invalid")).toBe("true");
    expect(button("Save").disabled).toBe(true);
    // The last valid preview stays.
    expect(previews("Source notes")).toEqual(["sources/attention-is-all-you-need.md"]);
  });

  it("resets a saved template to the default, removing it from the record", async () => {
    const { settings } = await open({
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      source_name_template: "{{ title }}",
    });
    expect(input("Source notes").value).toBe("{{ title }}");
    await act(async () => button("Reset to default", template("Source notes")).click());
    await settle();
    expect(input("Source notes").value).toBe("{{ title | slug }}");
    await act(async () => button("Save").click());
    await settle();
    expect(settings.getSnapshot().frontmatter).not.toHaveProperty("source_name_template");
  });

  it("explains why settings from a newer Reader are read-only", async () => {
    await open({
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 9,
    });
    expect(host.ownerDocument.querySelector(".file-name-settings-notice")?.textContent).toMatch(
      /newer version/u,
    );
    expect(input("Source notes").disabled).toBe(true);
  });

  it("warns about a saved template it cannot use", async () => {
    const { settings } = await open({
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      annotation_name_template: "{{ quote | nope }}",
    });
    expect(input("Annotations").value).toBe("{{ id }}");
    expect(
      template("Annotations").querySelector(".file-name-template-warning")?.textContent,
    ).toMatch(/Unknown filter "nope"/u);
    // Nothing is edited yet, so nothing is pending.
    expect(button("Save").disabled).toBe(true);

    await act(async () => button("Reset to default", template("Annotations")).click());
    await settle();
    expect(button("Save").disabled).toBe(false);
    await act(async () => button("Save").click());
    await settle();
    expect(settings.getSnapshot().frontmatter).not.toHaveProperty("annotation_name_template");
  });

  it("names the template another device changed", async () => {
    const { connection } = await open({
      app: "dev.mdbase.reader",
      scope: "collection",
      settings_version: 1,
      source_name_template: "{{ title }}",
    });
    await type(input("Source notes"), "{{ year }} {{ title }}");
    // Another device edits the same field while this one is being edited.
    const elsewhere = nativeReaderCollection(connection);
    closers.push(() => elsewhere.dispose());
    await act(async () => {
      await elsewhere.settings?.save({ source_name_template: "{{ author }} {{ title }}" });
    });
    await settle();
    await act(async () => button("Save").click());
    await settle();
    expect(host.ownerDocument.body.textContent).toContain(
      "The source notes template changed somewhere else.",
    );
  });
});
