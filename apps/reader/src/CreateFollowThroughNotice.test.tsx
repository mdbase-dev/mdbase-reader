// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateFollowThroughNotice } from "./CreateFollowThroughNotice.js";
import { createRoot } from "./testing/i18n.js";

import type {
  CreateAttention,
  CreateFollowThroughSnapshot,
  ReaderCreateFollowThrough,
} from "@mdbase-reader/connect";

const namesTaken: CreateAttention = {
  key: "src_adam",
  kind: "source",
  label: "Adam",
  reason: "names-taken",
  problem: "Another record in the collection already uses each name Reader tried for it.",
};

function followThrough(snapshot: CreateFollowThroughSnapshot): ReaderCreateFollowThrough {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    reconcile: vi.fn(() => Promise.resolve()),
    discard: vi.fn(() => Promise.resolve()),
  };
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  );
  if (!found) {
    throw new Error(`No ${name} button.`);
  }
  return found;
}

describe("CreateFollowThroughNotice", () => {
  it("says inline why the item was not added, and that its content is kept", async () => {
    const creates = followThrough({ waiting: 0, attention: [namesTaken] });
    await act(async () =>
      root.render(
        <CreateFollowThroughNotice
          followThrough={creates}
          attention={[namesTaken]}
          onHide={() => undefined}
        />,
      ),
    );
    const status = host.querySelector("[role=status]");
    expect(status?.textContent).toContain("“Adam” could not be added");
    expect(status?.textContent).toContain("kept on this device");
    // The buttons are not part of what is announced.
    expect(status?.querySelector("button")).toBeNull();
  });

  it("says so when trying again did not help", async () => {
    const creates = followThrough({ waiting: 0, attention: [namesTaken] });
    await act(async () =>
      root.render(
        <CreateFollowThroughNotice
          followThrough={creates}
          attention={[namesTaken]}
          onHide={() => undefined}
        />,
      ),
    );
    await act(async () => button("Try again").click());
    expect(creates.reconcile).toHaveBeenCalledWith({ retry: true });
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "Trying again did not help.",
    );
  });

  it("discards only after the user confirms", async () => {
    const creates = followThrough({ waiting: 0, attention: [namesTaken] });
    await act(async () =>
      root.render(
        <CreateFollowThroughNotice
          followThrough={creates}
          attention={[namesTaken]}
          onHide={() => undefined}
        />,
      ),
    );
    await act(async () => button("Discard…").click());
    expect(creates.discard).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Remove “Adam” from this device for good?");
    await act(async () => button("Discard").click());
    expect(creates.discard).toHaveBeenCalledWith("src_adam");
  });
});
