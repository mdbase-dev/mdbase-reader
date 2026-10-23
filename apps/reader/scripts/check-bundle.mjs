import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const publicAsset =
  /\.(?:html|js|mjs|css|wasm|woff2?|ttf|svg|png|webp|jpg|jpeg|ico|json|webmanifest)$/;

/** Validate the shipped manifest, not just the bundler's list of entry imports. */
export async function checkOfflineBundle(directory) {
  const worker = await readFile(join(directory, "mdbase-shell-sw.js"), "utf8");
  const encoded = /installOfflineShell\(self, (.+)\);/.exec(worker)?.[1];
  assert.ok(encoded, "Shared offline-shell manifest is missing");
  const manifest = JSON.parse(encoded);
  const assets = new Map(manifest.assets.map((asset) => [asset.path, asset.sha256]));
  async function walk(path = "") {
    for (const entry of await readdir(join(directory, path), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const relative = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile() && relative !== "mdbase-shell-sw.js" && publicAsset.test(relative)) {
        const hash = createHash("sha256")
          .update(await readFile(join(directory, relative)))
          .digest("hex");
        assert.equal(assets.get(relative), hash, `Offline precache missing/stale: ${relative}`);
      }
    }
  }
  await walk();
  return assets.size;
}

export function staticClosure(chunks, roots) {
  const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || !byFile.has(file)) return;
    seen.add(file);
    for (const imported of byFile.get(file).imports) visit(imported);
  }
  for (const root of roots) visit(root);
  return [...seen].map((file) => byFile.get(file));
}

export function checkLazyBoundaries(chunks) {
  const entry = staticClosure(
    chunks,
    chunks.filter((chunk) => chunk.entry).map((chunk) => chunk.file),
  );
  const workspace = staticClosure(
    chunks,
    chunks
      .filter((chunk) => chunk.modules.some(({ id }) => id.endsWith("/src/ReaderApp.tsx")))
      .map((chunk) => chunk.file),
  );
  const connection = staticClosure(chunks, [
    ...entry.map((chunk) => chunk.file),
    ...chunks
      .filter((chunk) =>
        chunk.modules.some(({ id }) =>
          /\/src\/(?:SdkReaderRoot\.tsx|sdk-application\.ts)$/.test(id),
        ),
      )
      .map((chunk) => chunk.file),
  ]);
  const secondary =
    /\/(?:LibraryWorkspace|CitationEditor|DisplaySettings|SourceAddDialog|SourceImportDialog|bibliography-download|build-source-export)\.[^/]+$/;
  const heavy = /\/(?:renderer-(?:pdf|epub|html)\/src|@embedpdf|@readium)\//;
  for (const chunk of [...entry, ...connection, ...workspace]) {
    assert.ok(!/worker|\.wasm/.test(chunk.file), `Worker in startup graph: ${chunk.file}`);
    for (const { id } of chunk.modules) {
      assert.ok(!secondary.test(id) && !heavy.test(id), `Eager secondary module: ${id}`);
    }
  }
  for (const chunk of connection) {
    assert.ok(
      !chunk.modules.some(({ id }) => id.endsWith("/src/ReaderWorkspace.tsx")),
      "Native connection gate eagerly imports the reading workspace",
    );
  }
  const yamlRoots = new Set(
    chunks.flatMap((chunk) =>
      chunk.modules.flatMap(({ id }) =>
        id.includes("/yaml/browser/") ? [id.split("/yaml/browser/")[0]] : [],
      ),
    ),
  );
  assert.ok(yamlRoots.size <= 1, `Duplicated YAML runtimes: ${[...yamlRoots].join(", ")}`);
  return { entry, connection, workspace };
}

async function measure(directory, chunks) {
  const measured = await Promise.all(
    chunks.map(async ({ file, ...chunk }) => {
      const bytes = await readFile(join(directory, file));
      return {
        ...chunk,
        file,
        raw: bytes.length,
        gzip: gzipSync(bytes).length,
        brotli: brotliCompressSync(bytes).length,
      };
    }),
  );
  const total = (key) => measured.reduce((sum, chunk) => sum + chunk[key], 0);
  return {
    raw: total("raw"),
    gzip: total("gzip"),
    brotli: total("brotli"),
    files: measured.map(({ file }) => file),
  };
}

async function main() {
  const directory = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../dist"),
  );
  const assets = await checkOfflineBundle(directory);
  console.log(
    `Offline shell verified: ${assets} precached assets (including lazy chunks, workers and WASM).`,
  );
  let report;
  try {
    report = JSON.parse(await readFile(join(directory, ".vite/reader-bundle.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  const { entry, connection, workspace } = checkLazyBoundaries(report);
  console.log(
    JSON.stringify(
      {
        initial: await measure(directory, entry),
        connectionRoute: await measure(directory, connection),
        workspace: await measure(directory, workspace),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
