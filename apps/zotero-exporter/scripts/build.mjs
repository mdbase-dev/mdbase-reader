import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  "manifest.json",
  "bootstrap.js",
  "controller.js",
  "content/export.xhtml",
  "content/export.js",
  "content/export.css",
];

// Small deterministic ZIP writer. Fixed timestamp, UTF-8 names, no external build tools.
export function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [path, data] of entries) {
    if (path.startsWith("/") || path.includes("..") || path.includes("\\"))
      throw new Error("Unsafe archive path");
    const name = Buffer.from(path);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x5c21, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(0x5c21, 14);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export async function build(outputDirectory = join(app, "dist")) {
  const manifest = JSON.parse(await readFile(join(app, "src/manifest.json"), "utf8"));
  const pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  if (manifest.version !== pkg.version) throw new Error("Plugin and package versions must match");
  const entries = await Promise.all(
    sources.map(async (name) => [name, await readFile(join(app, "src", name))]),
  );
  entries.push([
    "exporter.js",
    await readFile(resolve(app, "../../scripts/zotero-bundle/exporter.js")),
  ]);
  const content = zip(entries.sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(outputDirectory, { recursive: true });
  const name = `mdbase-reader-exporter-${manifest.version}.xpi`;
  const path = join(outputDirectory, name);
  await writeFile(path, content);
  await writeFile(
    path + ".sha256",
    `${createHash("sha256").update(content).digest("hex")}  ${name}\n`,
  );
  return path;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(await build());
