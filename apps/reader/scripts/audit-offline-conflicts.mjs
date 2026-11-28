// Browser editor and real SDK client; a MemoryReplica supplies deterministic replay outcomes.
import { decode, encode } from "@mdbase-dev/sdk/thin-client";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5311";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Offline conflict audits require a loopback origin.");
}
const replica = new MemoryReplica({ confirmDelayMs: null, where: () => true });
const article = replica.seed({
  path: "sources/article.md",
  types: ["reader-source"],
  frontmatter: { id: "article", title: "Article", tags: ["original-tag"] },
  body: "Original article note",
});
const annotation = replica.seed({
  path: "annotations/note.md",
  types: ["reader-annotation"],
  frontmatter: {
    id: "note",
    source: "[[sources/article]]",
    annotation_type: "note",
    created_at: "2026-11-01T00:00:00Z",
  },
  body: "Original annotation comment",
});
const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const ports = new Map();
let offline = false;
const cache = new Map();

try {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) return route.abort();
    if (!offline) {
      const response = await route.fetch();
      cache.set(url, {
        status: response.status(),
        contentType: response.headers()["content-type"],
        body: await response.body(),
      });
    }
    const cached = cache.get(url);
    return cached ? route.fulfill(cached) : route.abort();
  });
  await page.exposeBinding("fixtureOpenReplica", async ({ page }, bytes) => {
    const id = ports.size;
    const { port, helloResponse } = await replica.connector().open(decode(Uint8Array.from(bytes)));
    ports.set(id, port);
    port.onframe = (frame) => {
      void page
        .evaluate(({ id, bytes }) => globalThis.fixtureReceive?.(id, bytes), {
          id,
          bytes: [...encode(frame)],
        })
        .catch(() => {
          /* A push to the previous document can race reload. */
        });
    };
    return { id, hello: [...encode(helloResponse)] };
  });
  await page.exposeBinding("fixtureSend", (_, id, bytes) => {
    ports.get(id).send(decode(Uint8Array.from(bytes)));
  });

  await page.goto(`${origin}/test-fixtures/offline-conflict.html`);
  await page.waitForFunction(() => globalThis.fixture?.drafts().ready);
  offline = true;
  replica.setOnline(false);
  await context.setOffline(true);
  await page.evaluate(() => globalThis.fixture.editNotes());
  const drafts = () => page.evaluate(() => globalThis.fixture.drafts());
  await expect.poll(drafts).toMatchObject({
    sourceDraft: "Offline article note",
    annotationDraft: "Offline annotation comment",
  });
  const { path } = await page.evaluate(() => globalThis.fixture.editSourceAndHighlight());

  await page.reload();
  await page.waitForFunction(() => globalThis.fixture?.drafts().ready);
  expect(await page.evaluate(() => globalThis.navigator.onLine)).toBe(false);
  await expect.poll(drafts).toMatchObject({
    source: { text: "Offline article note" },
    annotation: { text: "Offline annotation comment" },
    sourceDraft: "Offline article note",
    annotationDraft: "Offline annotation comment",
  });
  expect(await page.evaluate(() => globalThis.fixture.current())).toMatchObject({
    tags: ["offline-tag"],
    reading: { status: "finished", position: { html: { progression: 0.6 } } },
  });
  expect(await page.evaluate((path) => globalThis.fixture.readHighlight(path), path)).toMatchObject(
    {
      body: "> Long article passage.",
    },
  );

  const peer = await replica.client();
  try {
    const pending = await peer.pendingWrites();
    const changes = pending.filter(({ receipt }) =>
      receipt.records?.some(({ id }) => id === article.id || id === annotation.id),
    );
    expect(changes).toHaveLength(5);
    // A simulated authority refuses the pending edits against a changed record.
    // The independent highlight is confirmed and survives.
    for (const {
      receipt: { mutation },
    } of changes.toReversed()) {
      replica.reject(mutation, {
        code: "conflict",
        reason: "revision",
        recovery: "refresh",
        message: "Edited on another device",
      });
    }
    replica.editElsewhere(article.id, {
      body: "Peer article note",
      frontmatter: {
        tags: ["peer-tag"],
        reading: { status: "archived", position: { html: { progression: 0.8 } } },
      },
    });
    replica.editElsewhere(annotation.id, { body: "Peer annotation comment" });
    replica.setOnline(true);
    replica.confirmAll();
    offline = false;
    await context.setOffline(false);
    await expect.poll(drafts).toMatchObject({
      source: { text: "Offline article note", conflict: "Peer article note" },
      annotation: { text: "Offline annotation comment", conflict: "Peer annotation comment" },
    });
    expect(await page.evaluate(() => globalThis.fixture.current())).toMatchObject({
      body: "Peer article note",
      tags: ["peer-tag"],
      reading: { status: "archived", position: { html: { progression: 0.8 } } },
    });
    expect(
      (await page.evaluate((path) => globalThis.fixture.readHighlight(path), path)).state.state,
    ).toBe("confirmed");
    expect(await peer.pendingWrites()).toEqual([]);
    await page.evaluate(() => globalThis.fixture.resolveNotes());
    replica.confirmAll();
    await expect.poll(drafts).toMatchObject({
      source: { text: "Peer article note", conflict: undefined },
      annotation: { text: "Offline annotation comment", conflict: undefined },
      sourceDraft: null,
      annotationDraft: null,
    });
  } finally {
    peer.close();
  }
  console.log("Offline reload and conflicting reconnect passed in Chromium", browser.version());
} finally {
  for (const port of ports.values()) port.close();
  await browser.close();
}
