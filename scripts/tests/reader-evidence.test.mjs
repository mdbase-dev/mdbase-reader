import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { metadataPhase } from "../lib/native-artifact-checkpoint.mjs";
import { boundedResponseBytes, download, checkpointMetadataHttp } from "../lib/native-artifact.mjs";
import { assertExtensionZip, createExtensionZip } from "../lib/reader-extension.mjs";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
const expected = {
  id: "42",
  digest: "sha256:" + "d".repeat(64),
  target: "staging",
  run: "123",
  attempt: "2",
  source: "a".repeat(40),
  repository: "owner/reader",
  repositoryId: "11",
  tree: "b".repeat(40),
  event: "workflow_dispatch",
};
const meta = {
  id: 42,
  expired: false,
  digest: expected.digest,
  name: "reader-native-build-staging-123-2",
  workflow_run: { id: 123, head_sha: expected.source, head_repository_id: 11 },
};
const run = {
  id: 123,
  repository: { full_name: "owner/reader", id: 11 },
  head_sha: expected.source,
  run_attempt: 2,
  event: "workflow_dispatch",
  head_branch: "release/native-staging",
};
for (const after of [false, true])
  test(
    (after ? "after/runAfter" : "before/run") +
      " EACH response checkpoints before validation and next lookup",
    async () => {
      const state = {},
        snapshots = [];
      let count = 0;
      await metadataPhase({
        expected,
        state,
        after,
        save: async (s) => snapshots.push(structuredClone(s)),
        get: async () => {
          count++;
          if (count === 2)
            assert.ok(snapshots.some((s) => s[after ? "after" : "before"]?.id === 42));
          return count === 1 ? meta : run;
        },
      });
      assert.ok(
        snapshots.some(
          (s) =>
            s[after ? "runAfter" : "run"]?.run_attempt === 2 &&
            s.reason === "metadata-validation-pending",
        ),
      );
    },
  );
for (const after of [false, true])
  test(
    (after ? "runAfter" : "run") + " wrong INITIAL attempt retained and no further retrieval",
    async () => {
      const state = {},
        snapshots = [];
      let count = 0;
      await assert.rejects(
        metadataPhase({
          expected,
          state,
          after,
          save: async (s) => snapshots.push(structuredClone(s)),
          get: async () => {
            count++;
            return count === 1 ? meta : { ...run, run_attempt: 1 };
          },
        }),
      );
      assert.equal(count, 2);
      const evidence = snapshots.at(-1);
      assert.equal(evidence[after ? "runAfter" : "run"].run_attempt, 1);
      assert.equal(evidence.reason, "metadata-validation-refused");
      assert.ok(
        snapshots.some(
          (s) =>
            s[after ? "runAfter" : "run"]?.run_attempt === 1 &&
            s.reason === "metadata-validation-pending",
        ),
      );
    },
  );
test("fetched after survives runAfter lookup error and includes safe stage/reason", async () => {
  const state = { before: meta, run },
    snapshots = [];
  let count = 0;
  await assert.rejects(
    metadataPhase({
      expected,
      state,
      after: true,
      save: async (s) => snapshots.push(structuredClone(s)),
      get: async () => {
        if (++count === 2) throw Error("private unlogged response");
        return meta;
      },
    }),
  );
  const evidence = snapshots.at(-1);
  assert.equal(evidence.after.id, 42);
  assert.equal(evidence.stage, "runAfter");
  assert.equal(evidence.reason, "metadata-lookup-refused");
  assert.ok(!JSON.stringify(evidence).includes("private unlogged"));
});
test("wrong after artifact digest retained BEFORE refusal/no runAfter lookup", async () => {
  const state = {},
    snapshots = [];
  let count = 0;
  await assert.rejects(
    metadataPhase({
      expected,
      state,
      after: true,
      save: async (s) => snapshots.push(structuredClone(s)),
      get: async () => {
        count++;
        return { ...meta, digest: "sha256:" + "e".repeat(64) };
      },
    }),
  );
  assert.equal(count, 1);
  assert.equal(snapshots.at(-1).after.digest, "sha256:" + "e".repeat(64));
  assert.equal(snapshots.at(-1).reason, "metadata-validation-refused");
});
test("metadata evidence projects only safe required identity, never response headers/extra payloads", async () => {
  const state = {};
  let count = 0;
  await metadataPhase({
    expected,
    state,
    save: async () => {},
    get: async () =>
      ++count === 1
        ? { ...meta, token: "private-do-not-retain" }
        : { ...run, env_vars: { SECRET: "private-do-not-retain" } },
  });
  assert.ok(!JSON.stringify(state).includes("private-do-not-retain"));
});
test("artifact byte download has stream byte/declared-length/deadline limits", async () => {
  assert.equal((await boundedResponseBytes(new Response("ok"), 2, 100)).toString(), "ok");
  await assert.rejects(boundedResponseBytes(new Response("too large"), 2, 100));
  await assert.rejects(
    boundedResponseBytes(new Response("x", { headers: { "content-length": "2" } }), 2, 100),
  );
  await assert.rejects(
    boundedResponseBytes(new Response(new ReadableStream({ start() {} })), 2, 10),
  );
});
test("unprivileged failure evidence is separate from qualified artifact outputs and protected job", async () => {
  const workflow = await readFile(".github/workflows/deploy-reader.yml", "utf8");
  const build = workflow.split("\n  native-build:\n")[1].split("\n  native-upload:\n")[0];
  assert.ok(
    build.indexOf("Initialize SAFE build-failure-only") < build.indexOf("actions/checkout@"),
  );
  assert.ok(build.includes("reader-native-build-failure-${{ inputs.target }}"));
  assert.ok(build.includes("qualifiedArtifact:false"));
  assert.ok(!build.includes("continue-on-error"));
  assert.ok(!build.includes("environment:"));
  assert.ok(!/\$\{\{\s*secrets\./.test(build));
  assert.ok(build.includes("artifact-id: ${{ steps.artifact.outputs.artifact-id }}"));
  assert.ok(build.includes("if: failure()"));
});
for (const stage of ["before", "run", "after", "runAfter"])
  for (const status of [403, 404, 429])
    test(`${stage} HTTP${status} persists bounded PUBLIC BODY + STATUS before status refusal`, async () => {
      const state = { stage },
        snapshots = [];
      const message =
        status === 403
          ? "Resource not accessible by integration"
          : status === 404
            ? "Not Found"
            : "Too Many Requests";
      const body = {
        message,
        status: String(status),
        documentation_url: "https://docs.github.com/rest/actions/artifacts",
      };
      const response = Response.json(body, { status });
      Object.defineProperty(response, "ok", {
        get() {
          assert.equal(
            snapshots.at(-1)?.responses?.[stage]?.publicBody?.message,
            message,
            "BODY checkpoint must precede HTTP status validation",
          );
          return false;
        },
      });
      await assert.rejects(
        checkpointMetadataHttp(response, {
          state,
          save: async (s) => snapshots.push(structuredClone(s)),
        }),
        /HTTP status/,
      );
      const evidence = state.responses[stage];
      assert.equal(evidence.httpStatus, status);
      assert.equal(evidence.publicBody.message, message);
      assert.equal(evidence.publicBody.status, String(status));
      assert.equal(evidence.publicBody.documentation_url, body.documentation_url);
      assert.equal(
        evidence.bodySha256,
        createHash("sha256").update(JSON.stringify(body)).digest("hex"),
      );
      assert.equal(evidence.bodyBytes, Buffer.byteLength(JSON.stringify(body)));
    });
test("metadata HTTP failure evidence never retains headers, tokens, SAS or opaque bodies", async () => {
  const state = { stage: "after" },
    snapshots = [];
  await assert.rejects(
    checkpointMetadataHttp(
      Response.json(
        {
          message: "https://blob.invalid/?sig=PRIVATE-SAS",
          documentation_url: "https://docs.github.com/rest?token=PRIVATE-TOKEN",
          headers: { Authorization: "Bearer PRIVATE-AUTH" },
          token: "PRIVATE-TOKEN",
        },
        { status: 403, headers: { Authorization: "Bearer PRIVATE-AUTH" } },
      ),
      { state, save: async (s) => snapshots.push(structuredClone(s)) },
    ),
  );
  const encoded = JSON.stringify(snapshots);
  for (const forbidden of ["PRIVATE-SAS", "PRIVATE-TOKEN", "PRIVATE-AUTH", "Authorization"])
    assert.ok(!encoded.includes(forbidden));
  assert.equal(state.responses.after.httpStatus, 403);
  assert.equal(state.responses.after.publicBody.message, null);
  assert.equal(state.responses.after.publicBody.documentation_url, null);
});
test("non-JSON HTTP body retains status/bounded body identity without opaque contents", async () => {
  const state = { stage: "runAfter" };
  await assert.rejects(
    checkpointMetadataHttp(new Response("opaque PRIVATE-SAS", { status: 429 }), {
      state,
      save: async () => {},
    }),
  );
  assert.equal(state.responses.runAfter.bodyBytes, 18);
  assert.equal(state.responses.runAfter.httpStatus, 429);
  assert.equal(state.responses.runAfter.bodyState, "non-JSON-public-body-omitted");
  assert.ok(!JSON.stringify(state).includes("PRIVATE-SAS"));
});
test("protected public input failure has initial SAFE receipt and no qualified outputs", async () => {
  const workflow = await readFile(".github/workflows/deploy-reader.yml", "utf8");
  const inputs = workflow.split("\n  native-inputs:\n")[1].split("\n  native-build:\n")[0];
  assert.ok(
    inputs.indexOf("Initialize SAFE input-failure receipt") < inputs.indexOf("- id: hashes"),
  );
  assert.ok(inputs.includes("qualifiedArtifact:false"));
  assert.ok(inputs.includes("if: failure()"));
  assert.ok(inputs.includes("reader-native-input-failure-"));
  assert.ok(!inputs.includes("artifact-id:"));
  assert.ok(!/\$\{\{\s*secrets\./.test(inputs));
});
test("reviewed byte helper remains byte-identical, never lint/format rewritten", async () => {
  const bytes = await readFile("scripts/lib/native-publish-bytes.mjs");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "a4336258cea726285573e9e667bba1c1ad6797fdba331715d0f17ea67ea5c66a",
  );
});
test("real download checkpoints fetched after before runAfter lookup fails", async () => {
  const parent = await mkdtemp(join(tmpdir(), "reader-zip-transport-"));
  try {
    const zip = join(parent, "input.zip");
    execFileSync("python3", [
      "-B",
      "-c",
      'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w"): pass',
      zip,
    ]);
    const bytes = await readFile(zip),
      digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    const e = { ...expected, digest },
      m = { ...meta, digest };
    let calls = 0;
    await assert.rejects(
      download(e, join(parent, "artifact"), async () => {
        calls++;
        if (calls === 1 || calls === 5) return Response.json(m);
        if (calls === 2) return Response.json(run);
        if (calls === 3)
          return new Response(null, {
            status: 302,
            headers: { location: "https://blob.invalid/original.zip" },
          });
        if (calls === 4) return new Response(bytes);
        throw Error("private lookup failure never persisted");
      }),
    );
    const evidence = JSON.parse(await readFile(join(parent, "artifact-metadata.json")));
    assert.equal(calls, 6);
    assert.equal(evidence.after.digest, digest);
    assert.equal(evidence.stage, "runAfter");
    assert.equal(evidence.reason, "metadata-lookup-refused");
    assert.equal(evidence.responses.after.httpStatus, 200);
    assert.ok(!JSON.stringify(evidence).includes("private lookup"));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test("non-200 fetched metadata status persists before HTTP validation/body lookup", async () => {
  const parent = await mkdtemp(join(tmpdir(), "reader-http-evidence-"));
  try {
    await assert.rejects(
      download(expected, join(parent, "artifact"), async () =>
        Response.json({ private: "must-not-persist" }, { status: 500 }),
      ),
    );
    const evidence = JSON.parse(await readFile(join(parent, "artifact-metadata.json")));
    assert.equal(evidence.responses.before.httpStatus, 500);
    assert.equal(evidence.reason, "metadata-lookup-refused");
    assert.ok(!JSON.stringify(evidence).includes("must-not-persist"));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
test("portable standard-library ZIP packages EVERY hidden/worker byte, never overwrites/rebuilds", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-portable-zip-"));
  try {
    const dir = join(root, "extension");
    await mkdir(join(dir, ".well-known"), { recursive: true });
    for (const [path, data] of Object.entries({
      ".well-known/mdbase-app.json": "{}",
      ".nojekyll": "",
      "worker.js": "fixture JS DATA, never executed",
    }))
      await writeFile(join(dir, path), data);
    const inventory = await inventoryDirectory(dir);
    assert.equal((await createExtensionZip(root, inventory)).length, 3);
    const before = await readFile(join(root, "extension.zip"));
    await assert.rejects(createExtensionZip(root, inventory));
    assert.deepEqual(await readFile(join(root, "extension.zip")), before);
    await writeFile(join(dir, ".extra"), "extra");
    await assert.rejects(createExtensionZip(root, inventory));
    assert.deepEqual(await readFile(join(root, "extension.zip")), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("post-only recovery cannot compile/rebuild/deploy or regenerate saved inventories", async () => {
  const source = await readFile("scripts/postqualify-native-staging.mjs", "utf8");
  assert.ok(!/execFileSync\(['"](?:pnpm|wrangler|vite)['"]/.test(source));
  assert.ok(!source.includes("--filter"));
  assert.ok(!source.includes('writeFile(join(root, "inventory.json")'));
  assert.ok(source.includes("await assertInventory"));
  assert.ok(source.includes("preexisting build plan no longer matches exact original inputs"));
});
test("extension ZIP is exact all bytes/path set and rejects links/traversal/extras", async () => {
  const parent = await mkdtemp(join(tmpdir(), "reader-extension-zip-"));
  try {
    const zip = join(parent, "extension.zip");
    const make = (mode) =>
      execFileSync("python3", [
        "-B",
        "-c",
        `import stat,sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w') as z:
 mode=sys.argv[2]
 if mode=='link':
  i=zipfile.ZipInfo('link');i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,'target')
 else: z.writestr('../escape' if mode=='traversal' else 'a.txt','a')`,
        zip,
        mode,
      ]);
    const inventory = [
      { path: "a.txt", bytes: 1, sha256: createHash("sha256").update("a").digest("hex") },
    ];
    make("valid");
    assert.equal((await assertExtensionZip(parent, inventory)).length, 1);
    await assert.rejects(assertExtensionZip(parent, []));
    for (const mode of ["link", "traversal"]) {
      make(mode);
      await assert.rejects(assertExtensionZip(parent, inventory));
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
