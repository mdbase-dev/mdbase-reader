import { memoryConnection } from "@mdbase-reader/connect/testing";
import { afterEach, expect, it } from "vitest";

import { extensionCollection } from "./sdk-collection.js";
import { applicationFixture, signedOutSnapshot } from "./testing/sdk-fixture.js";

import type { MdbaseApplicationConnection } from "@mdbase-reader/connect/native";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) {
    close();
  }
});

function context(
  connection: MdbaseApplicationConnection,
): ReturnType<typeof applicationFixture> & ReturnType<typeof extensionCollection> {
  const fixture = applicationFixture();
  fixture.controls.setConnections([connection]);
  fixture.controls.publishSnapshot({
    ...signedOutSnapshot,
    status: "ready",
    selectedCollectionId: connection.id,
    readiness: {
      ...signedOutSnapshot.readiness,
      assessment: { status: "ready", problem: null },
    },
  });
  const collection = extensionCollection(fixture.mdbase);
  cleanup.push(
    () => fixture.controls.close(),
    () => collection.dispose(),
  );
  return { ...fixture, ...collection };
}

it("independent contexts read a write through two clients of the same replica", async () => {
  const memory = await memoryConnection();
  cleanup.push(memory.close);
  const records = await memory.replica.client();
  cleanup.push(() => records.close());
  memory.replica.seed({
    path: "sources/article.md",
    types: ["source"],
    frontmatter: { id: "article", title: "Before" },
    body: "Original body",
  });
  const first = context(memory.connection);
  const second = context({
    ...memory.connection,
    records,
    files: records.files,
    generation: "second",
  });
  const firstCollection = first.connectedCollection();
  const secondCollection = second.connectedCollection();
  expect(firstCollection).not.toBeNull();
  expect(secondCollection).not.toBe(firstCollection);
  const firstRecords = first.mdbase.connection(memory.connection.id)?.records;
  const secondRecords = second.mdbase.connection(memory.connection.id)?.records;
  if (!firstRecords || !secondRecords) {
    throw new Error("Missing context connection");
  }
  const before = await secondRecords.get({ path: "sources/article.md" });
  expect(before.frontmatter["title"]).toBe("Before");
  const saved = await firstRecords.settle(
    firstRecords.update(before, { patch: { title: "After" } }),
  );
  expect(saved.outcome).toBe("confirmed");
  expect((await secondRecords.get(before)).frontmatter["title"]).toBe("After");

  // Retiring this page's adapters does not close the other context's borrowed client.
  first.dispose();
  expect((await records.get({ path: "sources/article.md" })).frontmatter["title"]).toBe("After");
  expect(second.connectedCollection()).toBe(secondCollection);
});

it("retires only the adapters whose selected connection generation changes", async () => {
  const memory = await memoryConnection();
  cleanup.push(memory.close);
  const first = context(memory.connection);
  const second = context(memory.connection);
  const old = first.connectedCollection();
  const other = second.connectedCollection();
  first.controls.setConnections([{ ...memory.connection, generation: "reopened" }]);
  expect(first.connectedCollection()).not.toBe(old);
  expect(second.connectedCollection()).toBe(other);
  first.controls.publishSnapshot(signedOutSnapshot);
  expect(first.connectedCollection()).toBeNull();
  expect(second.connectedCollection()).toBe(other);
});
