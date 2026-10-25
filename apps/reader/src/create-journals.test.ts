import { MemoryStorage } from "@mdbase-reader/platform";
import { describe, expect, it } from "vitest";

import { createJournals, type SignOutSource } from "./create-journals.js";

import type { PendingCreate } from "@mdbase-reader/core";

class FakeSdk implements SignOutSource {
  #snapshot: { signOutResult: unknown } = { signOutResult: null };
  readonly #listeners = new Set<() => void>();

  getSnapshot(): { readonly signOutResult?: unknown } {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(signOutResult: unknown): void {
    this.#snapshot = { signOutResult };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function pending(key: string): PendingCreate {
  return {
    key,
    collectionId: "reading",
    kind: "annotation",
    recordId: key,
    label: "A note",
    candidates: [`annotations/${key}.md`],
    attempt: 0,
    submission: 0,
    input: { frontmatter: { id: key } },
    state: "pending",
    startedAt: "2026-10-25T12:00:00.000Z",
  };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("kept creates and signing out", () => {
  it("clears the account's creates when it signs out", async () => {
    const storage = new MemoryStorage();
    const journals = createJournals(storage);
    const sdk = new FakeSdk();
    journals.clearOnSignOut(sdk);
    const alice = journals.journalFor("alice");
    await alice.put(pending("ann_1"));

    sdk.emit({ server: "signed_out" });
    await settled();
    expect(await alice.list("reading")).toEqual([]);
  });

  it("keeps the next account's creates while the earlier sign-out still shows", async () => {
    const storage = new MemoryStorage();
    const journals = createJournals(storage);
    const sdk = new FakeSdk();
    journals.clearOnSignOut(sdk);
    journals.journalFor("alice");
    sdk.emit({ server: "signed_out" });
    await settled();

    // Bob signs in; the snapshot still carries Alice's sign-out result.
    const bob = journals.journalFor("bob");
    await bob.put(pending("ann_2"));
    sdk.emit({ server: "signed_out" });
    sdk.emit({ server: "signed_out" });
    await settled();
    expect(await bob.list("reading")).toHaveLength(1);

    // The session starts again, and Bob signs out: now his go.
    sdk.emit(null);
    sdk.emit({ server: "signed_out" });
    await settled();
    expect(await bob.list("reading")).toEqual([]);
  });

  it("does not clear on a sign-out result that was there before the page listened", async () => {
    const storage = new MemoryStorage();
    const journals = createJournals(storage);
    const sdk = new FakeSdk();
    sdk.emit({ server: "signed_out" });
    journals.clearOnSignOut(sdk);
    const bob = journals.journalFor("bob");
    await bob.put(pending("ann_3"));
    sdk.emit({ server: "signed_out" });
    await settled();
    expect(await bob.list("reading")).toHaveLength(1);
  });
});
