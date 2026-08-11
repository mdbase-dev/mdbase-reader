import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants, createReadStream } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [sourceArgument, targetArgument, resumeArgument] = process.argv.slice(2);

if (!sourceArgument || !targetArgument) {
  console.error("Usage: node scripts/import-literature-vault.mjs <source-vault> <target-vault>");
  process.exit(2);
}

const sourceRoot = path.resolve(sourceArgument);
const targetRoot = path.resolve(targetArgument);
const markerPath = path.join(targetRoot, ".mdbase-reader-fixture.json");
const importedAt = new Date().toISOString();
const resumePartialImport = resumeArgument === "--resume";

async function main() {
  const query = spawnSync(
    "mdbase",
    ["-C", sourceRoot, "query", "--types", "literature", "--include-body", "--limit", "10000"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );

  if (query.status !== 0) {
    console.error(query.stderr || query.stdout);
    process.exit(query.status ?? 1);
  }

  const queryResult = JSON.parse(query.stdout);
  const records = queryResult?.result?.results;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`No literature records found in ${sourceRoot}`);
  }

  try {
    const existingMarker = JSON.parse(await readFile(markerPath, "utf8"));
    if (existingMarker.source !== sourceRoot) {
      throw new Error(
        `${targetRoot} is a fixture for a different source: ${existingMarker.source}`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    try {
      const entries = await readdir(targetRoot);
      if (entries.length > 0 && !resumePartialImport) {
        throw new Error(`Refusing to populate non-empty unmarked target: ${targetRoot}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const cslPropertyNames = await readCslPropertyNames();
  const sourceIdsByLegacyId = new Map();
  for (const record of records) {
    const citekey = String(record.effective_frontmatter.id);
    sourceIdsByLegacyId.set(citekey, fixtureId("src", citekey));
  }

  await mkdir(path.join(targetRoot, "_types"), { recursive: true });
  await mkdir(path.join(targetRoot, "sources"), { recursive: true });
  await mkdir(path.join(targetRoot, "annotations"), { recursive: true });
  await mkdir(path.join(targetRoot, "files"), { recursive: true });

  const mediaFiles = await findMediaFiles(path.join(sourceRoot, "biblib"));
  const mediaBySourcePath = new Map();
  let copiedBytes = 0;
  let copiedFiles = 0;

  for (const batch of chunks(mediaFiles, 4)) {
    await Promise.all(
      batch.map(async (absoluteSourcePath) => {
        const sourceRelativePath = normalizePath(path.relative(sourceRoot, absoluteSourcePath));
        const targetRelativePath = normalizePath(path.join("files", sourceRelativePath));
        const absoluteTargetPath = path.join(targetRoot, targetRelativePath);
        const fileStat = await stat(absoluteSourcePath);
        await mkdir(path.dirname(absoluteTargetPath), { recursive: true });
        let targetStat;
        try {
          targetStat = await stat(absoluteTargetPath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        if (!targetStat || targetStat.size !== fileStat.size) {
          await copyFile(absoluteSourcePath, absoluteTargetPath, fsConstants.COPYFILE_FICLONE);
        }
        const revision = `sha256:${await sha256File(absoluteSourcePath)}`;
        mediaBySourcePath.set(sourceRelativePath, {
          file_id: fixtureUuidV7(sourceRelativePath, fileStat.mtimeMs),
          file: `[[${targetRelativePath}]]`,
          role: "primary",
          format: path.extname(absoluteSourcePath).slice(1).toLowerCase(),
          media_type: mediaType(absoluteSourcePath),
          revision,
        });
        copiedBytes += fileStat.size;
        copiedFiles += 1;
        if (copiedFiles % 100 === 0) {
          console.error(`Copied and hashed ${copiedFiles}/${mediaFiles.length} media files`);
        }
      }),
    );
  }

  const diagnostics = [];
  const recordsByLegacyId = new Map(
    records.map((record) => [String(record.effective_frontmatter.id), record]),
  );
  const documentsByLegacyId = new Map();

  function documentsFor(citekey, ancestors = new Set()) {
    const cached = documentsByLegacyId.get(citekey);
    if (cached) return cached;
    if (ancestors.has(citekey)) return [];
    const record = recordsByLegacyId.get(citekey);
    if (!record) return [];
    const nextAncestors = new Set(ancestors).add(citekey);
    let documents = resolveDocuments(
      record.effective_frontmatter.attachment,
      mediaBySourcePath,
      diagnostics,
      citekey,
    );
    if (documents.length === 0) {
      for (const parentCitekey of parentCitekeys(record.effective_frontmatter)) {
        documents = documentsFor(parentCitekey, nextAncestors);
        if (documents.length > 0) break;
      }
    }
    const result = documents.map((document, index) => ({
      ...document,
      role: index === 0 ? "primary" : "alternative",
    }));
    documentsByLegacyId.set(citekey, result);
    return result;
  }

  let sourcesWithDocuments = 0;
  let sourcesWithReadingState = 0;
  let sourceRelationships = 0;

  for (const record of records) {
    const original = record.effective_frontmatter;
    const citekey = String(original.id);
    const documents = documentsFor(citekey);
    if (documents.length > 0) {
      sourcesWithDocuments += 1;
    }

    const relations = resolveRelations(original, sourceIdsByLegacyId);
    sourceRelationships += relations.length;
    const reading = resolveReading(original, documents);
    if (reading) {
      sourcesWithReadingState += 1;
    }

    const csl = {};
    for (const [key, value] of Object.entries(original)) {
      if (cslPropertyNames.has(key) && !localLiteratureFields.has(key) && value !== null) {
        csl[key] = value;
      }
    }
    csl.id = citekey;
    csl.type = original.type;
    csl.title = original.title;

    const unmapped = {};
    for (const [key, value] of Object.entries(original)) {
      if (
        !cslPropertyNames.has(key) &&
        !discardedSessionFields.has(key) &&
        !["attachment", "authorLink", "author-links", "author-link", "book_path"].includes(key)
      ) {
        unmapped[key] = value;
      }
    }

    const frontmatter = compactObject({
      type: "reader-source",
      id: sourceIdsByLegacyId.get(citekey),
      title: String(original.title),
      kind: readerKind(original.type),
      authors: displayCreators(original),
      published: publishedDate(original),
      url: stringValue(original.URL),
      description: stringValue(original.abstract),
      language: stringValue(original.language),
      saved_at: savedAt(original.dateCreated, record.file?.mtime),
      documents,
      reading,
      tags: Array.isArray(original.tags)
        ? original.tags.filter((tag) => tag !== "literature_note")
        : [],
      relations,
      csl,
      legacy: compactObject({
        citekey,
        source_path: record.path,
        date_modified: original.dateModified,
        attachments: original.attachment,
        author_links: original.authorLink ?? original["author-links"] ?? original["author-link"],
        book_path: original.book_path,
        unmapped: Object.keys(unmapped).length > 0 ? unmapped : undefined,
      }),
    });

    const rewrittenBody = rewriteMediaLinks(record.body ?? "", mediaBySourcePath);
    const output = `---\n${toYaml(frontmatter)}---\n${rewrittenBody}`;
    await writeFile(
      path.join(targetRoot, "sources", `${safeFilename(citekey)}.md`),
      output,
      "utf8",
    );
  }

  await writeFile(path.join(targetRoot, "mdbase.yaml"), collectionConfig, "utf8");
  await writeFile(path.join(targetRoot, "_types", "reader-source.md"), readerSourceType, "utf8");
  await writeFile(
    path.join(targetRoot, "_types", "reader-annotation.md"),
    readerAnnotationType,
    "utf8",
  );

  const report = {
    generated_at: importedAt,
    source: sourceRoot,
    target: targetRoot,
    records: records.length,
    media_files: copiedFiles,
    media_bytes: copiedBytes,
    sources_with_documents: sourcesWithDocuments,
    sources_with_reading_state: sourcesWithReadingState,
    source_relationships: sourceRelationships,
    diagnostics,
  };

  await writeFile(markerPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(targetRoot, "IMPORT_REPORT.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(targetRoot, "README.md"),
    `# mdbase Reader literature fixture\n\nGenerated from \`${sourceRoot}\` on ${importedAt}.\n\n` +
      `- ${records.length} Reader source records in \`sources/\`\n` +
      `- ${copiedFiles} independently copied PDF/EPUB files in \`files/biblib/\`\n` +
      `- Actual media SHA-256 revisions and deterministic fixture file IDs\n` +
      `- Original CSL metadata nested under \`csl\`\n` +
      `- Original note bodies retained, with copied-media links rewritten\n\n` +
      `This is a generated test fixture. The source vault was not modified. See \`IMPORT_REPORT.json\` for diagnostics.\n`,
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

async function readCslPropertyNames() {
  const schema = await readFile(path.join(sourceRoot, "_types", "literature.md"), "utf8");
  const start = schema.indexOf("    properties:\n");
  const end = schema.indexOf("    required:\n", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate CSL properties in the literature type");
  }
  const names = new Set();
  for (const line of schema.slice(start, end).split("\n")) {
    const match = line.match(/^ {6}([A-Za-z0-9_-]+):$/);
    if (match) {
      names.add(match[1]);
    }
  }
  return names;
}

async function findMediaFiles(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && /\.(pdf|epub)$/i.test(entry.name)) files.push(absolutePath);
    }
  }
  await visit(root);
  return files.sort();
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function fixtureId(prefix, seed) {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = createHash("sha256").update(seed).digest();
  let bits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && encoded.length < 26) {
      encoded += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (encoded.length === 26) break;
  }
  return `${prefix}_${encoded}`;
}

function fixtureUuidV7(seed, timestamp) {
  const timeHex = Math.max(0, Math.floor(timestamp)).toString(16).padStart(12, "0").slice(-12);
  const random = createHash("sha256").update(seed).digest("hex");
  const variant = ((Number.parseInt(random[3], 16) & 0x3) | 0x8).toString(16);
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`;
}

function resolveDocuments(attachments, media, diagnostics, citekey) {
  if (!Array.isArray(attachments)) return [];
  const resolved = [];
  const seen = new Set();
  for (const attachment of attachments) {
    if (typeof attachment !== "string") continue;
    const sourcePath = wikilinkTarget(attachment);
    const descriptor = media.get(sourcePath);
    if (!descriptor) {
      if (/\.(pdf|epub)$/i.test(sourcePath)) {
        diagnostics.push({ code: "missing-attachment", citekey, attachment: sourcePath });
      }
      continue;
    }
    if (seen.has(descriptor.file_id)) continue;
    seen.add(descriptor.file_id);
    resolved.push({ ...descriptor, role: resolved.length === 0 ? "primary" : "alternative" });
  }
  return resolved;
}

function resolveRelations(frontmatter, sourceIds) {
  const relations = [];
  const seen = new Set();
  for (const target of parentCitekeys(frontmatter)) {
    const targetId = sourceIds.get(target);
    if (!targetId || seen.has(targetId)) continue;
    seen.add(targetId);
    relations.push({ relation: "is_part_of", target: `[[${targetId}|${target}]]` });
  }
  return relations;
}

function parentCitekeys(frontmatter) {
  const candidates = [];
  if (typeof frontmatter.book_path === "string") candidates.push(frontmatter.book_path);
  for (const attachment of frontmatter.attachment ?? []) {
    if (typeof attachment === "string" && /^!?\[\[@/.test(attachment)) candidates.push(attachment);
  }
  return candidates.map((candidate) =>
    wikilinkTarget(candidate).replace(/^@/, "").replace(/\.md$/i, ""),
  );
}

function resolveReading(frontmatter, documents) {
  const rawProgress = numberValue(frontmatter.reading_progress);
  const progress =
    rawProgress === undefined ? undefined : Math.max(0, Math.min(1, rawProgress / 100));
  const lastOpened = stringValue(frontmatter.last_read ?? frontmatter.reading_timestamp);
  const cfi = stringValue(frontmatter.last_opened_cfi);
  const page = numberValue(frontmatter.reading_page ?? frontmatter.current_page);
  if (progress === undefined && !lastOpened && !cfi && page === undefined) return undefined;
  const document = documents[0];
  return compactObject({
    status: progress !== undefined && progress >= 0.995 ? "finished" : "reading",
    progress,
    document_file_id: document?.file_id,
    position: cfi
      ? { epub: { cfi } }
      : page !== undefined
        ? { pdf: { page_index: Math.max(0, Math.trunc(page) - 1) } }
        : undefined,
    last_opened_at: validDate(lastOpened),
  });
}

function rewriteMediaLinks(body, media) {
  return body.replace(/(!?\[\[)([^\]|#]+)([^\]]*\]\])/g, (whole, prefix, target, suffix) => {
    const normalized = normalizePath(target);
    return media.has(normalized) ? `${prefix}files/${normalized}${suffix}` : whole;
  });
}

function displayCreators(frontmatter) {
  const people =
    Array.isArray(frontmatter.author) && frontmatter.author.length > 0
      ? frontmatter.author
      : frontmatter.editor;
  if (!Array.isArray(people)) return [];
  return people
    .map((person) => {
      if (typeof person === "string") return person;
      if (!person || typeof person !== "object") return undefined;
      if (person.literal) return String(person.literal);
      return [person.given, person.family].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

function publishedDate(frontmatter) {
  const parts = frontmatter.issued?.["date-parts"]?.[0];
  if (Array.isArray(parts) && parts.length > 0) return parts.map(String).join("-");
  return frontmatter.year === undefined ? undefined : String(frontmatter.year);
}

function readerKind(cslType) {
  const mapping = {
    "article-journal": "paper",
    "paper-conference": "paper",
    "article-magazine": "article",
    "article-newspaper": "article",
    "post-weblog": "post",
    motion_picture: "video",
    song: "document",
    speech: "document",
    thesis: "document",
  };
  return mapping[cslType] ?? cslType ?? "unknown";
}

function savedAt(created, fallback) {
  return validDate(created) ?? validDate(fallback) ?? importedAt;
}

function validDate(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function wikilinkTarget(value) {
  return normalizePath(
    value
      .replace(/^!?\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0],
  );
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function safeFilename(value) {
  return value.replaceAll("/", "_").replaceAll("\\", "_");
}

function mediaType(filename) {
  return /\.epub$/i.test(filename) ? "application/epub+zip" : "application/pdf";
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item !== undefined && item !== null && (!Array.isArray(item) || item.length > 0),
    ),
  );
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  let output = "";
  for (const [key, item] of Object.entries(value)) {
    const yamlKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
    if (Array.isArray(item)) {
      if (item.length === 0) output += `${pad}${yamlKey}: []\n`;
      else {
        output += `${pad}${yamlKey}:\n`;
        for (const entry of item) {
          if (isObject(entry)) {
            const nested = toYaml(entry, indent + 4);
            output += `${pad}  - ${nested
              .slice(indent + 4)
              .replace(/\n$/, "")
              .replaceAll(`\n${" ".repeat(indent + 4)}`, `\n${pad}    `)}\n`;
          } else output += `${pad}  - ${yamlScalar(entry)}\n`;
        }
      }
    } else if (isObject(item)) {
      output += `${pad}${yamlKey}:\n${toYaml(item, indent + 2)}`;
    } else output += `${pad}${yamlKey}: ${yamlScalar(item)}\n`;
  }
  return output;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function yamlScalar(value) {
  return JSON.stringify(value);
}

const localLiteratureFields = new Set([
  "zettelid",
  "dateCreated",
  "dateModified",
  "authorLink",
  "year",
  "attachment",
  "tags",
]);

const discardedSessionFields = new Set(["reading_history", "reading_sessions", "reading_stats"]);

const collectionConfig = `spec_version: 0.3.0
settings:
  types_folder: _types
  explicit_type_keys: []
  exclude: []
  record_extensions:
    - md
  validation: warn
  id_field: id
name: mdbase Reader literature fixture
description: Generated Reader sources and independently copied literature media.
`;

const readerSourceType = `---
kind: mdbase.type
name: reader-source
version: 1
description: A source and user-authored literature note for mdbase Reader.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    required: [type, id, title, kind, saved_at]
    properties:
      type: { const: reader-source }
      id: { type: string, pattern: "^src_[0-9A-HJKMNP-TV-Z]{26}$" }
      title: { type: string, minLength: 1 }
      kind: { type: string, minLength: 1 }
      authors:
        type: array
        items: { type: string }
      published: { type: string }
      url: { type: string }
      description: { type: string }
      language: { type: string }
      saved_at: { type: string, format: date-time }
      documents:
        type: array
        items:
          type: object
          additionalProperties: true
          required: [file_id, file, role, revision]
          properties:
            file_id: { type: string, format: uuid }
            file: { type: string }
            role: { type: string }
            revision: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
            format: { type: string }
            media_type: { type: string }
      reading:
        type: object
        additionalProperties: true
        required: [status]
        properties:
          status: { type: string }
          progress: { type: number, minimum: 0, maximum: 1 }
      tags:
        type: array
        items: { type: [string, number, boolean] }
      relations:
        type: array
        items:
          type: object
          required: [relation, target]
          properties:
            relation: { type: string }
            target: { type: string }
      csl: { type: object }
      legacy: { type: object }
match:
  path_glob: sources/**/*.md
  fields_present: [id, title, kind]
collection:
  unique:
    - field: id
      scope: type
  links:
    documents[].file:
      target_type: any
      validate_exists: true
    relations[].target:
      target_type: reader-source
      validate_exists: false
---

# Reader source

Generated fixture implementation of \`dev.mdbase.reader.source\`.
`;

const readerAnnotationType = `---
kind: mdbase.type
name: reader-annotation
version: 1
description: An independently addressable mdbase Reader annotation.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    required: [type, id, source, annotation_type, created_at]
    properties:
      type: { const: reader-annotation }
      id: { type: string }
      source: { type: string }
      annotation_type: { type: string }
      created_at: { type: string, format: date-time }
match:
  path_glob: annotations/**/*.md
  fields_present: [id, source, annotation_type]
---

# Reader annotation

Fixture type for annotations created while testing Reader.
`;

await main();
