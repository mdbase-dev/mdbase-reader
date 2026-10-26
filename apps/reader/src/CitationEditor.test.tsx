// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  CitationChangedElsewhereError,
  collectionId,
  recordRevision,
  sourceId,
  type CslItem,
  type Source,
} from "@mdbase-reader/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CitationEditor } from "./CitationEditor.js";
import { createRoot } from "./testing/i18n.js";
import { useCitationEditor } from "./use-citation-editor.js";
import { writeSessionChoice } from "./use-session-choice.js";

import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Root } from "react-dom/client";

vi.mock("@mdbase-dev/ui/mark-activity", () => ({ signalMdbaseMark: vi.fn() }));
vi.mock("./MultilineCodeEditor.js", () => ({
  MultilineCodeEditor: ({
    ariaLabel,
    value,
    onChange,
  }: {
    readonly ariaLabel: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
const confirm = vi.hoisted(() => vi.fn<(request: { title: string }) => Promise<boolean>>());
vi.mock("./confirmation.js", () => ({ requestConfirmation: confirm }));

const citation = {
  id: "kingma2015adam",
  type: "paper-conference",
  title: "Adam: A method for stochastic optimization",
  author: [
    { family: "Kingma", given: "Diederik P." },
    { family: "Ba", given: "Jimmy" },
  ],
  URL: "https://arxiv.org/abs/1412.6980",
};
const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_adam"),
  path: "sources/adam.md",
  title: "Adam",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-adam"),
  frontmatter: { csl: citation },
  citation,
  cslProvenance: { title: { value: citation.title, source: "registry:doi.org" } },
};
const gateway = { saveSourceCitation: vi.fn() } as unknown as ReaderWorkspaceGateway;
const writeText = vi.fn<(text: string) => Promise<void>>();

let root: Root;
let container: HTMLDivElement;

function Harness(): React.JSX.Element {
  const editor = useCitationEditor({ gateway, source, onSaved: vi.fn() });
  const workspace = {
    sourceRecord: { status: "ready", value: source },
    citation: editor,
    sourceFields: { available: false, saving: false, error: null, save: vi.fn() },
  } as unknown as ReaderSourceWorkspaceController;
  return <CitationEditor workspace={workspace} />;
}

async function render(): Promise<void> {
  await act(async () => root.render(<Harness />));
}

/** citeproc loads and formats asynchronously, outside React's act queue. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  }
  expect(predicate()).toBe(true);
}

function button(name: string | RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => {
    const label = item.getAttribute("aria-label") ?? item.textContent;
    return typeof name === "string" ? label === name : name.test(label);
  });
  if (!found) {
    throw new Error(`No button named ${String(name)}`);
  }
  return found;
}

function setNativeValue(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = Object.getPrototypeOf(field) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
}

function titleInput(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(".citation-field.is-wide input")!;
}

async function editTitle(value: string): Promise<void> {
  const title = titleInput();
  await act(async () => {
    setNativeValue(title, value);
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function referenceText(): string {
  return container.querySelector(".citation-reference-text")?.textContent ?? "";
}

beforeEach(() => {
  sessionStorage.clear();
  confirm.mockReset().mockResolvedValue(false);
  vi.mocked(gateway.saveSourceCitation).mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, "execCommand");
});

describe("Citation tab", () => {
  it("leads with the formatted citation, then one way to fix details", async () => {
    await render();
    await settle(() => referenceText().includes("Kingma, D. P."));
    const reference = container.querySelector(".citation-reference")!;
    const health = container.querySelector(".citation-health")!;
    expect(reference.compareDocumentPosition(health) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(health.textContent).toContain("1 detail to check");
    expect(health.textContent).toContain("No publication date is recorded.");
    expect(button("Fix details").className).toContain("is-primary");
    expect(container.querySelectorAll(".is-primary")).toHaveLength(1);
    expect(container.querySelector(".citation-details")?.textContent).toContain("Not set");
    expect(container.querySelector('[aria-label="Citation style"]')?.textContent).toContain(
      "APA 7th",
    );
  });

  it("keeps field evidence, lookup and CSL-JSON collapsed by default", async () => {
    await render();
    const disclosures = [...container.querySelectorAll<HTMLDetailsElement>(".citation-disclosure")];
    expect(disclosures.map((item) => item.querySelector("summary > span")?.textContent)).toEqual([
      "Field evidence",
      "Look up by DOI, ISBN, URL or title",
      "CSL-JSON",
    ]);
    expect(disclosures.every((item) => !item.open)).toBe(true);
    expect(disclosures[0]?.querySelector("summary small")?.textContent).toContain("doi.org");
    expect(container.querySelector('[aria-label="CSL-JSON citation details"]')).toBeNull();
  });

  it("reopens disclosures opened earlier in the session", async () => {
    writeSessionChoice("disclosure.citation.csl-json", "open");
    await render();
    const json = [...container.querySelectorAll<HTMLDetailsElement>(".citation-disclosure")].at(-1);
    expect(json?.open).toBe(true);
    expect(container.querySelector('[aria-label="CSL-JSON citation details"]')).not.toBeNull();
  });

  it("copies the formatted text and confirms the style in place", async () => {
    await render();
    await settle(() => referenceText().includes("Kingma, D. P."));
    await act(async () => button("Copy").click());
    expect(writeText).toHaveBeenCalledWith(referenceText());
    expect(button("Copied").textContent).toBe("Copied");
    expect(container.querySelector(".citation-copy-status")?.textContent).toBe("Copied as APA 7th");
  });

  it("copies the citation key with its @ prefix", async () => {
    await render();
    await act(async () => button("Copy citation key @kingma2015adam").click());
    expect(writeText).toHaveBeenCalledWith("@kingma2015adam");
  });

  it("opens Fix details, keeps the draft on the way back, and offers Save details", async () => {
    await render();
    await act(async () => button("Fix details").click());
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Back to citation");
    expect(container.querySelector(".citation-fix-head h3")?.textContent).toBe("Fix details");
    expect(container.querySelector(".citation-checks")?.textContent).toContain(
      "No publication date is recorded.",
    );
    expect(button(/Save details/u).getAttribute("aria-disabled")).toBe("true");
    await editTitle("Adam, revised");
    expect(button(/Save details/u).getAttribute("aria-disabled")).toBe("false");

    await act(async () => button("Back to citation").click());
    expect(document.activeElement?.textContent).toBe("Fix details");
    // Save details is now the filled button; Fix details steps back.
    expect(button("Fix details").className).not.toContain("is-primary");
    expect(button(/Save details/u).getAttribute("aria-disabled")).toBe("false");
    expect(container.textContent).toContain("Unsaved changes");
  });

  it("asks before Discard changes, then returns to the saved citation", async () => {
    await render();
    await act(async () => button("Fix details").click());
    expect(() => button("Discard changes")).toThrow();
    await editTitle("Adam, revised");
    confirm.mockResolvedValueOnce(false);
    await act(async () => button("Discard changes").click());
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Discard changes?" }));
    expect(titleInput().value).toBe("Adam, revised");

    confirm.mockResolvedValueOnce(true);
    await act(async () => button("Discard changes").click());
    expect(document.activeElement?.textContent).toBe("Fix details");
    expect(container.querySelector(".citation-editor-footer")).toBeNull();
    await act(async () => button("Fix details").click());
    expect(titleInput().value).toBe(citation.title);
  });

  it("blocks the form while the CSL-JSON cannot be read, offering Discard changes", async () => {
    writeSessionChoice("disclosure.citation.csl-json", "open");
    await render();
    const json = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="CSL-JSON citation details"]',
    )!;
    await act(async () => {
      setNativeValue(json, '{"id": "kingma2015adam",');
      json.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Fix details").click());
    const blocked = container.querySelector(".citation-json-blocked");
    expect(blocked?.textContent).toContain("CSL-JSON has errors — fix them or discard");
    expect(container.querySelector(".citation-field")).toBeNull();
    expect(
      [...container.querySelectorAll("button")].filter(
        (item) => item.textContent === "Discard changes",
      ),
    ).toHaveLength(1);

    confirm.mockResolvedValueOnce(true);
    await act(async () => button("Discard changes").click());
    expect(container.querySelector(".citation-health")?.textContent).toContain("1 detail to check");
  });
});

describe("saving from the citation view", () => {
  async function editThenReturn(): Promise<void> {
    await render();
    await act(async () => button("Fix details").click());
    await editTitle("Adam, revised");
    await act(async () => button("Back to citation").click());
  }

  async function saveFromSummary(): Promise<HTMLButtonElement> {
    const save = button(/Save details/u);
    save.focus();
    await act(async () => save.click());
    await settle(() => !container.textContent.includes("Saving…"));
    return save;
  }

  it("keeps the footer and focus after a save, and says Saved", async () => {
    vi.mocked(gateway.saveSourceCitation).mockImplementation(async (_source, csl, options) => ({
      ...source,
      recordRevision: recordRevision("rev-adam-2"),
      frontmatter: { csl },
      citation: csl as CslItem,
      cslProvenance: options?.provenance ?? {},
    }));
    await editThenReturn();
    const save = await saveFromSummary();
    expect(container.querySelector(".citation-editor-footer")?.textContent).toContain("Saved");
    expect(save.isConnected).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(save.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows a failed save beside Save details", async () => {
    vi.mocked(gateway.saveSourceCitation).mockRejectedValue(new Error("The disk is full."));
    await editThenReturn();
    await saveFromSummary();
    expect(container.querySelector('.citation-editor-footer [role="alert"]')?.textContent).toBe(
      "The disk is full.",
    );
    expect(button(/Save details/u).getAttribute("aria-disabled")).toBe("false");
  });

  it("keeps the draft when the citation changed elsewhere", async () => {
    vi.mocked(gateway.saveSourceCitation).mockRejectedValue(
      new CitationChangedElsewhereError({ ...citation, title: "Theirs" }),
    );
    await editThenReturn();
    await saveFromSummary();
    expect(container.querySelector(".citation-editor-footer")?.textContent).toContain(
      "Your draft is still here",
    );
    expect(button("Use their version")).toBeDefined();
  });
});

describe("copying without a clipboard", () => {
  it("falls back, then says plainly when copying the key fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    await render();
    const key = button("Copy citation key @kingma2015adam");
    key.focus();
    await act(async () => key.click());
    const status = container.querySelector('.citation-key-status[role="status"]');
    expect(status?.textContent).toBe("Copying is unavailable here.");
    expect(document.activeElement).toBe(key);
  });

  it("announces a copied key in a live region", async () => {
    await render();
    await act(async () => button("Copy citation key @kingma2015adam").click());
    expect(container.querySelector('.citation-key-status[role="status"]')?.textContent).toBe(
      "Copied",
    );
  });
});
