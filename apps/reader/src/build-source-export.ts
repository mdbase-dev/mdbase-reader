import {
  materializeSource,
  serializeCslBibliography,
  type Annotation,
  type FileRevision,
  type MaterializationProblem,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";

export interface SourceExportFile {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface SourceExportProblem {
  readonly path: string;
  readonly message: string;
}

export interface SourceExportBundle {
  readonly blob: Blob;
  readonly fileName: string;
  readonly canonicalRecordCount: number;
  readonly originalFileCount: number;
  readonly materializationProblems: readonly MaterializationProblem[];
  readonly fileProblems: readonly SourceExportProblem[];
}

type YamlStringify = (value: unknown, options?: { readonly lineWidth?: number }) => string;

export async function buildSourceExport(input: {
  readonly source: Source;
  readonly annotations: readonly Annotation[];
  readonly citationSources: readonly SourceSummary[];
  readonly readFile: (file: string, expectedRevision?: FileRevision) => Promise<SourceExportFile>;
}): Promise<SourceExportBundle> {
  const [{ BlobWriter, TextReader, Uint8ArrayReader, ZipWriter }, { stringify }] =
    await Promise.all([import("@zip.js/zip.js"), import("yaml")]);
  const materialized = materializeSource(input.source, input.annotations, input.citationSources);
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false });
  await writer.add(
    `canonical/${safeArchivePath(input.source.path)}`,
    new TextReader(markdownRecord(input.source.frontmatter, input.source.body, stringify)),
  );
  for (const annotation of input.annotations) {
    const path = annotation.path ?? `annotations/${annotation.id}.md`;
    await writer.add(
      `canonical/${safeArchivePath(path)}`,
      new TextReader(markdownRecord(annotationFrontmatter(annotation), annotation.body, stringify)),
    );
  }
  const materializedName = fileStem(input.source.path);
  await writer.add(`materialized/${materializedName}.md`, new TextReader(materialized.markdown));
  if (materialized.bibliography.length > 0) {
    await writer.add(
      "materialized/references.json",
      new TextReader(serializeCslBibliography(materialized.bibliography)),
    );
  }

  const fileProblems: SourceExportProblem[] = [];
  let originalFileCount = 0;
  for (const target of fileTargets(input.source, input.annotations)) {
    try {
      const file = await input.readFile(target.file, target.revision);
      await writer.add(`originals/${safeArchivePath(file.path)}`, new Uint8ArrayReader(file.bytes));
      originalFileCount += 1;
    } catch (reason) {
      fileProblems.push({
        path: portableFilePath(target.file),
        message: reason instanceof Error ? reason.message : "Reader could not export this file.",
      });
    }
  }
  if (materialized.problems.length > 0 || fileProblems.length > 0) {
    await writer.add(
      "EXPORT-REPORT.md",
      new TextReader(exportReport(materialized.problems, fileProblems)),
    );
  }
  const blob = await writer.close();
  return {
    blob,
    fileName: `${downloadStem(input.source.title)}-reader-export.zip`,
    canonicalRecordCount: input.annotations.length + 1,
    originalFileCount,
    materializationProblems: materialized.problems,
    fileProblems,
  };
}

function markdownRecord(
  frontmatter: Readonly<Record<string, unknown>>,
  body: string,
  stringify: YamlStringify,
): string {
  const yaml = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trimEnd()}\n`;
}

function annotationFrontmatter(annotation: Annotation): Readonly<Record<string, unknown>> {
  return (
    annotation.frontmatter ?? {
      type: "reader-annotation",
      id: annotation.id,
      source: annotation.source,
      annotation_type: annotation.annotationType,
      ...(annotation.document
        ? {
            document: {
              file_id: annotation.document.fileId,
              file: annotation.document.file,
              revision: annotation.document.revision,
            },
          }
        : {}),
      ...(annotation.motivation ? { motivation: annotation.motivation } : {}),
      ...(annotation.color ? { color: annotation.color } : {}),
      ...(annotation.locator ? { locator: annotation.locator } : {}),
      ...(annotation.target ? { target: annotation.target } : {}),
      tags: annotation.tags,
      created_at: annotation.createdAt,
      ...(annotation.modifiedAt ? { modified_at: annotation.modifiedAt } : {}),
      ...(annotation.createdBy ? { created_by: annotation.createdBy } : {}),
    }
  );
}

interface FileTarget {
  readonly file: string;
  readonly revision?: FileRevision;
}

function fileTargets(source: Source, annotations: readonly Annotation[]): readonly FileTarget[] {
  const targets = new Map<string, FileTarget>();
  for (const document of source.documents) {
    targets.set(portableFilePath(document.file), {
      file: document.file,
      revision: document.revision,
    });
  }
  for (const annotation of annotations) {
    if (annotation.document) {
      const path = portableFilePath(annotation.document.file);
      if (!targets.has(path)) {
        targets.set(path, {
          file: annotation.document.file,
          revision: annotation.document.revision,
        });
      }
    }
    for (const file of embeddedFiles(annotation.body)) {
      const path = portableFilePath(file);
      if (!targets.has(path)) {
        targets.set(path, { file });
      }
    }
  }
  return [...targets.values()];
}

function embeddedFiles(markdown: string): readonly string[] {
  return [...markdown.matchAll(/!?\[\[((?:files\/)[^\]|#]+)(?:[|#][^\]]*)?\]\]/gu)].map(
    (match) => match[1] ?? "",
  );
}

function portableFilePath(link: string): string {
  const wikilink = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(link.trim());
  return wikilink?.[1] ?? link.trim();
}

function safeArchivePath(path: string): string {
  const safe = portableFilePath(path)
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return safe || "record.md";
}

function fileStem(path: string): string {
  return (safeArchivePath(path).split("/").at(-1) ?? "source").replace(/\.md$/iu, "");
}

function downloadStem(title: string): string {
  const stem = title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLocaleLowerCase();
  return stem || "source";
}

function exportReport(
  materialization: readonly MaterializationProblem[],
  files: readonly SourceExportProblem[],
): string {
  const lines = [
    "# Reader export report",
    "",
    "The canonical records were preserved. Review these incomplete derived outputs:",
    "",
    ...materialization.map((problem) => `- ${problem.message}`),
    ...files.map((problem) => `- ${problem.path}: ${problem.message}`),
  ];
  return `${lines.join("\n")}\n`;
}
