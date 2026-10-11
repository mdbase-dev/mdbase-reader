// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { createApplicationFixture, memoryConnection } from "@mdbase-reader/connect/testing";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { SdkReaderRoot } from "./SdkReaderRoot.js";

import type { MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

vi.mock("@mdbase-dev/ui/feedback", () => ({ FeedbackButton: () => null }));

const facet = { checking: false, assessment: null, problem: null };
const signedOut: MdbaseApplicationSnapshot = {
  status: "signed_out",
  signIn: null,
  collections: [],
  selectedCollectionId: null,
  problem: null,
  timing: null,
  selection: {
    state: "none",
    requested: { collectionId: null, source: "none", displayName: null, approved: false },
    usable: null,
    problem: null,
  },
  readiness: {
    ...facet,
    facets: {
      capabilities: facet,
      contracts: facet,
      configuration: facet,
      files: facet,
      people: facet,
      notifications: facet,
    },
  },
};
const paired: NonNullable<MdbaseApplicationSnapshot["signIn"]> = {
  requestId: "fixture-request",
  installationId: "fixture-installation",
  deviceId: "fixture-device",
  appId: "fixture-app",
  kind: "app-runtime",
  verificationUri: "https://mdbase.test/approve",
  state: "paired",
  accountId: "fixture-account",
  accountProvider: "github",
  accountLogin: "reader-user",
  collectionIds: [],
  createCollections: false,
  requestedCreateCollections: false,
};

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const owned: { close(): void }[] = [];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const item of owned.splice(0).reverse()) {
    item.close();
  }
  vi.unstubAllGlobals();
});

function fixture(
  initial: Partial<MdbaseApplicationSnapshot>,
): ReturnType<typeof createApplicationFixture> {
  const created = createApplicationFixture({
    declaration: {
      id: "reader.fixture",
      name: manifest.name,
      origin: "https://reader.mdbase.dev",
      environment: "lab",
      manifest,
    },
    connections: [],
    initialSnapshot: { ...signedOut, ...initial },
  });
  owned.push(created.controls);
  return created;
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!found) {
    throw new Error(`No ${label} button in: ${host.textContent}`);
  }
  return found;
}

it("starts the SDK once and leaves setup to configure without inferring readiness", async () => {
  const { entry, controls } = fixture({
    status: "not_started",
    signIn: paired,
    selectedCollectionId: "c1",
    collections: [{ collectionId: "c1", displayName: "Reading", role: "owner" }],
  });
  const application = entry.application();
  controls.setHandler("start", () => ({ ...application.getSnapshot(), status: "setup_required" }));
  const renderNative = vi.fn(() => <p>workspace</p>);

  await act(async () =>
    root.render(
      <StrictMode>
        <SdkReaderRoot sdk={entry} renderNative={renderNative} />
      </StrictMode>,
    ),
  );
  await act(async () => button("Set up mdbase Reader").click());

  const actions = controls.observedActions().map((call) => call.action);
  expect(actions.filter((action) => action === "start")).toHaveLength(1);
  expect(actions.filter((action) => action === "configure")).toHaveLength(1);
  expect(
    controls.observedActions().find((call) => call.action === "configure")?.signal,
  ).toBeInstanceOf(AbortSignal);
  expect(host.textContent).toContain("needs mdbase Reader setup");
  expect(renderNative).not.toHaveBeenCalled();
});

it("opens the native collection only for a current READY connection, and retires it after", async () => {
  const native = await memoryConnection({ where: () => false });
  owned.push(native);
  const id = native.connection.id;
  const { entry, controls } = fixture({
    status: "ready",
    signIn: paired,
    selectedCollectionId: id,
    collections: [{ collectionId: id, displayName: "Reading", role: "owner" }],
  });
  const application = entry.application();
  controls.setHandler("start", () => application.getSnapshot());
  controls.setConnections([native.connection]);
  const opened: string[] = [];
  const renderNative = vi.fn(({ collection }: { collection: { collectionName: string } }) => {
    opened.push(collection.collectionName);
    return <p>workspace</p>;
  });

  await act(async () => root.render(<SdkReaderRoot sdk={entry} renderNative={renderNative} />));
  // Not READY until the SDK's readiness assessment says so.
  expect(renderNative).not.toHaveBeenCalled();

  await act(async () =>
    controls.publishSnapshot({
      ...application.getSnapshot(),
      readiness: {
        ...application.getSnapshot().readiness,
        assessment: { status: "ready", problem: null },
      },
    }),
  );
  expect(host.textContent).toContain("workspace");
  expect(opened.at(-1)).toBe("Reading");
  const scope = renderNative.mock.calls.at(-1)?.[0] as unknown as {
    collection: { sources: { get(collection: string, id: string): Promise<unknown> } };
  };
  // MemoryReplica evaluates no `select`, so the ID lookup finds no row; the call
  // still reaches the replica through the live scope.
  await expect(scope.collection.sources.get(id, "a")).resolves.toBeNull();

  native.setCurrent(false);
  await act(async () => controls.publishSnapshot({ ...application.getSnapshot() }));
  expect(host.textContent).not.toContain("workspace");
  await expect(scope.collection.sources.get(id, "a")).rejects.toThrow();
});

it("offers approval or another collection for an unapproved collection named by the link", async () => {
  const { entry, controls } = fixture({
    status: "unselected",
    signIn: paired,
    selection: {
      state: "approval_required",
      requested: { collectionId: "c9", source: "url", displayName: null, approved: false },
      usable: null,
      problem: null,
    },
  });
  await act(async () => root.render(<SdkReaderRoot sdk={entry} />));
  expect(host.textContent).toContain("isn't approved for the collection in this link");

  await act(async () => button("Approve this collection").click());
  await act(async () => button("Choose another collection").click());

  const actions = controls.observedActions().map((call) => call.action);
  expect(actions).toContain("approve");
  expect(actions).toContain("chooseAnother");
  expect(actions).not.toContain("select");
});
