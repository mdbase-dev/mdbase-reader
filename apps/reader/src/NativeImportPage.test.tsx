// @vitest-environment happy-dom
import { createTestApp, type TestApp } from "@mdbase-reader/connect/testing";
import * as migration from "@mdbase-reader/migration";
import { act, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { NativeImportPage } from "./NativeImportPage.js";
import { createRoot } from "./testing/i18n.js";

vi.mock("./connect.js", () => {
  throw new Error("Native imports must not load the legacy Reader session");
});
vi.mock("@mdbase-dev/ui/feedback", () => ({ FeedbackButton: () => null }));
// Import parsing stand-ins only; SDK clients/currentness/collection scopes are real public fixtures.
vi.mock("@mdbase-reader/migration", async (original) => {
  const module = await original<typeof migration>();
  return {
    ...module,
    readZoteroBundle: vi.fn(module.readZoteroBundle),
    planZotero: vi.fn(module.planZotero),
  };
});

const plan: migration.MigrationPlan = {
  service: "zotero",
  namespace: "owned-test",
  files: [],
  sources: [
    {
      key: "owned",
      id: "00000000-0000-4000-8000-000000000123",
      path: "sources/owned.md",
      fields: { title: "Owned source" },
      body: "Owned source",
      documents: [],
    },
  ],
  annotations: [],
  warnings: ["Owned preview retained"],
  summary: { sources: 1, notes: 0, annotations: 0, files: 0, bytes: 0 },
};
const bundle: Awaited<ReturnType<typeof migration.readZoteroBundle>> = {
  manifest: {},
  rows: { items: [], notes: [], annotations: [], attachments: [], collections: [] },
  files: new Map(),
  payloads: [],
  metadata: new Map(),
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const owned: TestApp[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(migration.readZoteroBundle).mockResolvedValue(bundle);
  vi.mocked(migration.planZotero).mockResolvedValue(plan);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => Promise.resolve(root.unmount()));
  host.remove();
  await Promise.all(owned.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(ready = true): Promise<TestApp> {
  const app = await createTestApp({
    declaration: {
      id: "reader.fixture",
      name: manifest.name,
      origin: "https://reader.mdbase.dev",
      environment: "lab",
      manifest,
    },
    collections: [{ name: "Reading" }],
    phase: ready ? "ready" : "signed_out",
  });
  owned.push(app);
  return app;
}
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) {
    throw new Error(`Missing ${label}`);
  }
  return found;
}
async function selectInput(): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error("Missing original Zotero input");
  }
  const file = new File(["{}"], "manifest.json");
  Object.defineProperty(file, "webkitRelativePath", { value: "owned-bundle/manifest.json" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  Object.defineProperty(input, "files", { value: transfer.files });
  await act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return Promise.resolve();
  });
}

it("native import home keeps the existing tiles without starting any SDK/legacy session", async () => {
  const h = await fixture(false);
  await act(() => Promise.resolve(root.render(<NativeImportPage sdk={h.mdbase} service="home" />)));
  expect(host.textContent).toContain("Bring your library with you.");
  expect(host.querySelector('a[href$="import/zotero"]')).not.toBeNull();
  expect(host.querySelector('a[href$="import/readwise"]')).not.toBeNull();
  expect(h.controls.observedActions()).toHaveLength(0);
});

it("input/preview survives SDK destination changes without a nested main or borrowed client close", async () => {
  const h = await fixture();
  const close = vi.spyOn(h.client(), "close");
  const create = vi.spyOn(h.client(), "create");
  h.controls.setHandler("chooseAnother", () => h.set("choosing"));
  await act(() =>
    Promise.resolve(
      root.render(
        <StrictMode>
          <NativeImportPage sdk={h.mdbase} service="zotero" />
        </StrictMode>,
      ),
    ),
  );
  await selectInput();
  expect(host.textContent).toContain("Owned preview retained");
  expect(host.textContent).toContain("Collection: Reading");
  expect(host.querySelectorAll("main")).toHaveLength(1);
  expect(host.textContent).not.toContain("Import 1 sources into");
  await act(() => Promise.resolve(button("Choose another collection").click()));
  expect(
    h.controls.observedActions().filter((call) => call.action === "chooseAnother"),
  ).toHaveLength(1);
  expect(host.textContent).toContain("Owned preview retained");
  expect(host.textContent).not.toContain("Check destination:");
  await act(() => Promise.resolve(h.set("ready")));
  expect(host.textContent).toContain("Owned preview retained");
  expect(button("Check destination: Reading")).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it("a late destination check cannot confirm a retired scope after readiness returns", async () => {
  const h = await fixture();
  let finish!: (result: Awaited<ReturnType<typeof migration.previewMigration>>) => void;
  const preview = vi.spyOn(migration, "previewMigration").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() =>
    Promise.resolve(root.render(<NativeImportPage sdk={h.mdbase} service="zotero" />)),
  );
  await selectInput();
  await act(() => Promise.resolve(button("Check destination: Reading").click()));
  expect(preview).toHaveBeenCalledOnce();
  await act(() => Promise.resolve(h.set("choosing")));
  await act(() => Promise.resolve(h.set("ready")));
  await act(() => Promise.resolve(finish({ newRecords: 1, existingRecords: 0 })));
  expect(host.textContent).toContain("Stopped. Already committed data is kept");
  expect(host.textContent).not.toContain("Destination checked. Confirm");
  expect(host.textContent).not.toContain("Import 1 sources into");
  expect(host.textContent).toContain("Owned preview retained");
});
