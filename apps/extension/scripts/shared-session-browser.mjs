import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { chromium, expect } from "@playwright/test";
import { build } from "vite";

// Two separately bundled browser contexts, using the pinned SDK's original Worker,
// WASM and SQLite against one local unsynced replica. Registration is a fixture;
// no account, Connect service, collection grant or log service is contacted.
const root = resolve(import.meta.dirname, "..");
const scratch = resolve(root, "../../.tmp");
await mkdir(scratch, { recursive: true });
const directory = await mkdtemp(join(scratch, "extension-shared-session-"));
const dist = join(directory, "dist");
let browser;
let server;
const errors = [];
const unexpected = [];
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
try {
  for (const [name, host] of [
    ["host", true],
    ["follower", false],
  ]) {
    await build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "error",
      define: { __SESSION_HOST__: JSON.stringify(host) },
      worker: { format: "es" },
      build: {
        outDir: dist,
        emptyOutDir: host,
        target: "es2022",
        rolldownOptions: {
          input: resolve(root, "scripts/fixtures/shared-session.mjs"),
          output: { entryFileNames: `${name}.js` },
        },
      },
    });
  }
  server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (["/host", "/follower"].includes(path)) {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><script type="module" src="${path}.js"></script>`);
      return;
    }
    const file = resolve(dist, `.${path}`);
    if (!file.startsWith(`${dist}/`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader(
        "Content-Type",
        extname(file) === ".wasm" ? "application/wasm" : "text/javascript",
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.href === "https://connect.mdbase.dev/v1/apps/register") {
      const { manifest } = request.postDataJSON();
      const digest = createHash("sha256").update(canonical(manifest)).digest("hex");
      return route.fulfill({
        json: {
          application: {
            id: "55555555-5555-4555-8555-555555555555",
            name: manifest.name,
            manifest_digest: digest,
            canonical_identity: `bundle:${manifest.id}:sha256:${digest}`,
            family_identity: `bundle:${manifest.id}`,
            distribution: "web",
            application_declaration: manifest,
          },
        },
      });
    }
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  const follower = await context.newPage();
  const host = await context.newPage();
  const workers = [];
  for (const page of [host, follower]) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => workers.push(worker.url()));
  }
  await follower.goto(`${origin}/follower`);
  await expect
    .poll(() => follower.evaluate(() => globalThis.fixtureMdbase?.getSnapshot().status))
    .toBe("starting");
  assert.equal(workers.length, 0, "a host:false context never constructs a Worker");
  await host.goto(`${origin}/host`);
  for (const page of [host, follower]) {
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            phase: globalThis.fixtureMdbase?.getSnapshot().phase.kind,
            error: globalThis.fixtureError,
            problem: globalThis.fixtureMdbase?.getSnapshot().phase.problem,
          })),
        { timeout: 15000 },
      )
      .toEqual({ phase: "unsynced", error: undefined, problem: undefined });
  }
  assert.equal(workers.length, 1, "one SDK Worker serves both bundles");
  const ids = await Promise.all(
    [host, follower].map((page) =>
      page.evaluate(() => globalThis.fixtureMdbase.getSnapshot().phase.connection.id),
    ),
  );
  assert.equal(ids[0], ids[1], "both contexts open the same replica");
  await host.evaluate(async () => {
    const records = globalThis.fixtureMdbase.getSnapshot().phase.connection.records;
    await records.create({
      path: "shared.md",
      frontmatter: { title: "From the host" },
      body: "Shared body",
    });
  });
  const read = await follower.evaluate(async () => {
    const records = globalThis.fixtureMdbase.getSnapshot().phase.connection.records;
    const record = await records.get({ path: "shared.md" }, { include: { body: true } });
    await records.update(record, { patch: { title: "From the follower" } });
    return { title: record.frontmatter.title, body: record.body };
  });
  assert.deepEqual(read, { title: "From the host", body: "Shared body" });
  assert.equal(
    await host.evaluate(
      async () =>
        (
          await globalThis.fixtureMdbase
            .getSnapshot()
            .phase.connection.records.get({ path: "shared.md" })
        ).frontmatter.title,
    ),
    "From the follower",
  );
  await follower.close();
  assert.equal(
    await host.evaluate(
      async () =>
        (
          await globalThis.fixtureMdbase
            .getSnapshot()
            .phase.connection.records.get({ path: "shared.md" })
        ).frontmatter.title,
    ),
    "From the follower",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS: two separate bundles, one original SDK Worker and replica; writes visible in both directions; follower close leaves host usable.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(directory, { recursive: true, force: true });
}
