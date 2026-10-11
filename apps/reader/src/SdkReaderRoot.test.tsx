// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  createApplicationFixture,
  mdbaseError,
  memoryConnection,
} from "@mdbase-reader/connect/testing";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import manifest from "./generated/mdbase-app.json";
import { SdkReaderRoot } from "./SdkReaderRoot.js";

import type { MdbaseApplicationSnapshot, MdbaseSetupPlan } from "@mdbase-reader/connect/native";

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

const setupPlan: MdbaseSetupPlan = {
  status: "setup",
  canApply: true,
  digest: `sha256:${"a".repeat(64)}`,
  summary: "This app will make 1 change to this collection.",
  changes: [
    { kind: "create", target: "_types/source.md", message: 'Add the "source" record type.' },
  ],
  conflicts: [],
  adoptable: {},
  packs: [],
  staged: [],
  records: [],
};

async function setupRequired(): Promise<ReturnType<typeof createApplicationFixture>> {
  const created = fixture({
    status: "not_started",
    signIn: paired,
    selectedCollectionId: "c1",
    collections: [{ collectionId: "c1", displayName: "Reading", role: "owner" }],
  });
  const application = created.entry.application();
  created.controls.setHandler("start", () => ({
    ...application.getSnapshot(),
    status: "setup_required",
  }));
  created.controls.setSetupPlan(setupPlan);
  const renderNative = vi.fn(() => <p>workspace</p>);
  await act(async () =>
    root.render(
      <StrictMode>
        <SdkReaderRoot sdk={created.entry} renderNative={renderNative} />
      </StrictMode>,
    ),
  );
  expect(host.textContent).toContain("needs mdbase Reader setup");
  await act(async () => button("Set up mdbase Reader").click());
  expect(renderNative).not.toHaveBeenCalled();
  return created;
}
const count = (
  controls: { observedActions(): readonly { action: string }[] },
  name: string,
): number => controls.observedActions().filter(({ action }) => action === name).length;

it("starts the SDK once and reviews setup before Confirm applies the reviewed plan", async () => {
  const { controls } = await setupRequired();
  expect(count(controls, "start")).toBe(1);
  expect(host.textContent).toContain(setupPlan.summary);
  expect(host.textContent).toContain('Add the "source" record type.');
  expect(count(controls, "applySetup")).toBe(0);

  await act(async () => button("Confirm").click());
  expect(count(controls, "applySetup")).toBe(1);
  expect(
    controls.observedActions().find((call) => call.action === "applySetup")?.signal,
  ).toBeInstanceOf(AbortSignal);
  expect(count(controls, "configure")).toBe(0);
  // Applying never infers readiness; the SDK's next snapshot decides.
  expect(host.textContent).toContain("needs mdbase Reader setup");
});

it("plans again when the collection changed during review, and Cancel writes nothing", async () => {
  const { controls } = await setupRequired();
  controls.setHandler("applySetup", () => {
    throw mdbaseError("conflict", "changed", "setup_changed");
  });
  await act(async () => button("Confirm").click());
  expect(host.textContent).toContain("changed while you were reviewing");
  expect(count(controls, "planSetup")).toBe(2);
  expect(count(controls, "applySetup")).toBe(1);

  await act(async () => button("Cancel").click());
  expect(host.textContent).toContain("needs mdbase Reader setup");
  expect(count(controls, "applySetup")).toBe(1);
  expect(count(controls, "configure")).toBe(0);
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

it.each(["readiness problem", "assessment problem", "incompatible", "unchecked"] as const)(
  "a settled %s shows a clear screen and an action instead of endless Opening",
  async (state) => {
    const problem = { code: "private-readiness-diagnostic" };
    const { entry, controls } = fixture({
      status: "ready",
      signIn: paired,
      selectedCollectionId: "c1",
      collections: [{ collectionId: "c1", displayName: "Reading", role: "owner" }],
      readiness: {
        ...signedOut.readiness,
        problem: state === "readiness problem" ? problem : null,
        assessment:
          state === "unchecked"
            ? null
            : {
                status: state === "incompatible" ? "incompatible" : "ready",
                problem: state === "assessment problem" ? problem : null,
              },
      },
    });
    controls.setHandler("start", () => entry.application().getSnapshot());
    await act(async () => root.render(<SdkReaderRoot sdk={entry} renderNative={vi.fn()} />));
    expect(host.textContent).not.toContain("Opening");
    expect(host.textContent).not.toContain("private-readiness-diagnostic");
    if (state === "incompatible") {
      expect(host.textContent).toContain("This collection isn't compatible");
      const update = [...host.querySelectorAll("a")].find(
        (link) => link.textContent === "Update the app",
      );
      expect(update?.getAttribute("href")).toMatch(/^https:\/\//);
      await act(async () => button("Choose another collection").click());
      expect(controls.observedActions().map((call) => call.action)).toContain("chooseAnother");
    } else {
      await act(async () => button("Check again").click());
      expect(controls.observedActions().map((call) => call.action)).toContain("assess");
    }
  },
);

it("a blocked open shows the SDK's title, copy and one action", async () => {
  const { entry, controls } = fixture({ status: "blocked", problem: "unauthenticated" });
  await act(async () => root.render(<SdkReaderRoot sdk={entry} />));
  expect(host.textContent).toContain("Sign in again");
  expect(host.textContent).toContain("Your session has ended");
  expect(host.querySelectorAll("button")).toSatisfy(
    (buttons: NodeListOf<HTMLButtonElement>) =>
      [...buttons].filter((item) => item.textContent === "Sign in").length === 1,
  );
  await act(async () => button("Sign in").click());
  expect(controls.observedActions().map((call) => call.action)).toContain("authorize");
});
