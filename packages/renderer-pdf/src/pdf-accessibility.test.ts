// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

import { installPdfAccessibility } from "./pdf-accessibility.js";

import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";

afterEach(() => document.body.replaceChildren());

function fixture(): { host: EmbedPdfContainer; root: ShadowRoot } {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<div><div style="overflow-y:auto"><div style="position:relative;margin-left:auto;margin-right:auto;width:600px;height:900px"><img><img></div></div></div><div data-epdf-i="reader-page-controls"><input></div><button><svg role="img"></svg></button>';
  document.body.append(host);
  return { host: host as unknown as EmbedPdfContainer, root };
}

it("exposes ordered page text, names the page input and makes the viewport reachable", async () => {
  const { host, root } = fixture();
  const extractText = vi.fn((_document, pages: number[]) => ({
    toPromise: () => Promise.resolve(`Text from page ${String(pages[0])}`),
  }));
  const stop = installPdfAccessibility(
    host,
    { extractText } as unknown as PdfEngine,
    { pageCount: 2 } as PdfDocumentObject,
    vi.fn(),
  );
  await vi.waitFor(() => expect(root.querySelectorAll("article section")).toHaveLength(2));
  expect([...root.querySelectorAll("article p")].map((paragraph) => paragraph.textContent)).toEqual(
    ["Text from page 0", "Text from page 1"],
  );
  expect(root.querySelector("input")?.getAttribute("aria-label")).toBe("Page");
  expect(root.querySelector('[role="region"]')?.getAttribute("tabindex")).toBe("0");
  expect([...root.querySelectorAll("img")].every((image) => image.alt === "")).toBe(true);
  expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  stop();
  expect(root.querySelector("article")).toBeNull();
});

it("does not hide bitmap content when a page has no accessible equivalent", async () => {
  const { host, root } = fixture();
  const extractText = vi.fn(() => ({ toPromise: () => Promise.resolve("") }));
  const stop = installPdfAccessibility(
    host,
    { extractText } as unknown as PdfEngine,
    { pageCount: 1 } as PdfDocumentObject,
    vi.fn(),
  );
  await vi.waitFor(() =>
    expect(root.querySelector("article p")?.textContent).toBe("No extractable text on this page."),
  );
  expect(root.querySelector("img")?.alt).toBe("PDF page image");
  stop();
});

it("reports extraction failure without hiding the page image", async () => {
  const { host, root } = fixture();
  const extractText = vi.fn(() => ({ toPromise: () => Promise.reject(new Error("unreadable")) }));
  const stop = installPdfAccessibility(
    host,
    { extractText } as unknown as PdfEngine,
    { pageCount: 1 } as PdfDocumentObject,
    vi.fn(),
  );
  await vi.waitFor(() =>
    expect(root.querySelector("article p")?.textContent).toBe("Page text could not be loaded."),
  );
  expect(root.querySelector("img")?.alt).toBe("PDF page image");
  stop();
});

it("stops extraction after disposal, including an in-flight failure", async () => {
  const { host, root } = fixture();
  let reject!: (reason: Error) => void;
  const pending = new Promise<string>((_accept, fail) => {
    reject = fail;
  });
  const extractText = vi.fn(() => ({ toPromise: () => pending }));
  const stop = installPdfAccessibility(
    host,
    { extractText } as unknown as PdfEngine,
    { pageCount: 3 } as PdfDocumentObject,
    vi.fn(),
  );
  stop();
  reject(new Error("disposed"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(extractText).toHaveBeenCalledOnce();
  expect(root.querySelector("article")).toBeNull();
});

it("names the phone navigation sheet and makes late thumbnail content reachable", async () => {
  const { host, root } = fixture();
  const stop = installPdfAccessibility(
    host,
    {} as PdfEngine,
    { pageCount: 0 } as PdfDocumentObject,
    vi.fn(),
  );
  const backdrop = document.createElement("div");
  backdrop.className = "bg-bg-overlay";
  const sheet = document.createElement("section");
  sheet.setAttribute("data-sidebar-id", "sidebar-panel");
  sheet.innerHTML = '<button role="tab" tabindex="0"></button><button role="tab"></button>';
  root.append(backdrop, sheet);
  await vi.waitFor(() => expect(sheet.getAttribute("aria-label")).toBe("PDF navigation"));
  expect(sheet.getAttribute("aria-modal")).toBe("true");
  expect(
    [...sheet.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Thumbnails", "Outline"]);
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  sheet.append(scroller);
  await vi.waitFor(() => expect(scroller.tabIndex).toBe(0));
  expect(scroller.getAttribute("role")).toBe("tabpanel");
  expect(scroller.getAttribute("aria-labelledby")).toBe("reader-pdf-nav-0");
  stop();
});

it("does not turn the desktop navigation sidebar into a modal sheet", () => {
  const { host, root } = fixture();
  const sidebar = document.createElement("section");
  sidebar.setAttribute("data-sidebar-id", "sidebar-panel");
  root.append(sidebar);
  const stop = installPdfAccessibility(
    host,
    {} as PdfEngine,
    { pageCount: 0 } as PdfDocumentObject,
    vi.fn(),
  );
  expect(sidebar.hasAttribute("role")).toBe(false);
  expect(sidebar.hasAttribute("aria-modal")).toBe(false);
  stop();
});

it("names desktop tabs and activates virtual thumbnail buttons by keyboard without a modal", () => {
  const { host, root } = fixture();
  const sidebar = document.createElement("section");
  sidebar.dataset["sidebarId"] = "sidebar-panel";
  sidebar.innerHTML =
    '<div><button role="tab" aria-selected="true"></button><button role="tab" aria-selected="false"></button></div><div style="overflow-y: auto"><div style="cursor: pointer"><img><span>3</span></div></div>';
  root.append(sidebar);
  const stop = installPdfAccessibility(
    host,
    {} as PdfEngine,
    { pageCount: 0 } as PdfDocumentObject,
    vi.fn(),
  );
  const tabs = sidebar.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  expect(tabs[0]?.getAttribute("aria-label")).toBe("Thumbnails");
  expect(tabs[1]?.tabIndex).toBe(-1);
  const activate = vi.fn();
  tabs[1]?.addEventListener("click", activate);
  tabs[0]?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
  );
  expect(activate).toHaveBeenCalledOnce();
  expect(root.activeElement).toBe(tabs[1]);
  const thumbnail = sidebar.querySelector<HTMLElement>('[aria-label="Page 3"]');
  expect(thumbnail?.getAttribute("role")).toBe("button");
  expect(thumbnail?.tabIndex).toBe(0);
  const open = vi.fn();
  thumbnail?.addEventListener("click", open);
  thumbnail?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(sidebar.hasAttribute("aria-modal")).toBe(false);
  stop();
});

it("reports readiness once, only after the late viewport is named and keyboard reachable", async () => {
  const { host, root } = fixture();
  const content = root.innerHTML;
  root.replaceChildren();
  const ready = vi.fn(() => {
    const viewport = root.querySelector<HTMLElement>("[data-reader-pdf-viewport]");
    expect(viewport?.getAttribute("aria-label")).toBe("PDF pages");
    expect(viewport?.tabIndex).toBe(0);
  });
  const stop = installPdfAccessibility(
    host,
    {} as PdfEngine,
    { pageCount: 0 } as PdfDocumentObject,
    ready,
  );
  expect(ready).not.toHaveBeenCalled();
  root.innerHTML = content;
  await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
  root.append(document.createElement("span"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(ready).toHaveBeenCalledOnce();
  stop();
});
