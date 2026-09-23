import {
  identity,
  stamp,
  text,
  type Fields,
  type MigrationPlan,
  type MigrationSource,
} from "./model.js";
import { downloadReadwiseFile, type ReadwiseClient } from "./readwise-client.js";
import { archiveReadwise, tagNames } from "./readwise-values.js";
export async function readwiseSource(row: Fields, namespace: string): Promise<MigrationSource> {
  const key = text(row["id"]);
  const id = await identity(namespace, key);
  const kinds: Record<string, string> = {
    pdf: "document",
    epub: "book",
    rss: "article",
    tweet: "post",
  };
  return {
    key,
    id,
    path: `sources/imports/${id}.md`,
    body: "",
    documents: [],
    fields: {
      title: text(row["title"], "Untitled Readwise document"),
      kind: kinds[text(row["category"])] ?? text(row["category"], "document"),
      saved_at: stamp(row["saved_at"] ?? row["created_at"]),
      authors: text(row["author"]) ? [text(row["author"])] : [],
      url: text(row["source_url"]),
      tags: tagNames(row["tags"]),
      description: text(row["summary"]),
      reading: reading(row),
      import: { service: "readwise", namespace, key, native: archiveReadwise(row) },
    },
  };
}
function reading(row: Fields): Fields {
  const statuses: Record<string, string> = {
    archive: "archived",
    later: "queued",
    shortlist: "queued",
  };
  const progress = row["reading_progress"];
  return {
    status: statuses[text(row["location"])] ?? "inbox",
    ...(typeof progress === "number" && progress >= 0 && progress <= 1 ? { progress } : {}),
  };
}
export function readwiseFiles(
  source: MigrationSource,
  row: Fields,
  plan: MigrationPlan,
  client: ReadwiseClient,
): void {
  const category = text(row["category"]);
  const html = text(row["html_content"]);
  const key = source.key;
  if (["pdf", "epub"].includes(category) && row["raw_source_url"]) {
    plan.files.push({
      key,
      path: `files/reader/imports/${source.id}.${category}`,
      mediaType: category === "pdf" ? "application/pdf" : "application/epub+zip",
      load: (s) => loadOriginal(client, key, category, text(row["raw_source_url"]), s),
    });
    source.documents.push({
      fileKey: key,
      role: "primary",
      format: category,
      label: text(row["title"]),
    });
  } else if (html) {
    const blob = new Blob([html], { type: "text/html" });
    plan.files.push({
      key,
      path: `files/reader/imports/${source.id}.html`,
      mediaType: "text/html",
      bytes: blob.size,
      load: (s) => {
        s.throwIfAborted();
        return Promise.resolve(blob);
      },
    });
    source.documents.push({
      fileKey: key,
      role: "primary",
      format: "html",
      label: text(row["title"]),
    });
    if (["pdf", "epub"].includes(category)) {
      plan.warnings.push(
        `Original ${category.toUpperCase()} unavailable; saved HTML retained: ${key}`,
      );
    }
  } else {
    plan.warnings.push(`No downloadable content; importing metadata only: ${key}`);
  }
}
export function freshReadwiseUrl(value: string, now = Date.now()): boolean {
  try {
    const query = new URL(value).searchParams;
    const expires = Number(query.get("Expires")) * 1000;
    if (expires > now + 60_000) {
      return true;
    }
    const date = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(
      query.get("X-Amz-Date") ?? "",
    );
    if (!date) {
      return false;
    }
    const stamp = `${date.slice(1, 4).join("-")}T${date.slice(4, 7).join(":")}Z`;
    return Date.parse(stamp) + Number(query.get("X-Amz-Expires")) * 1000 > now + 60_000;
  } catch {
    return false;
  }
}
async function loadOriginal(
  client: ReadwiseClient,
  key: string,
  category: string,
  initialUrl: string,
  signal: AbortSignal,
): Promise<Blob> {
  let url = initialUrl;
  if (!freshReadwiseUrl(url)) {
    const page = await client.page({ id: key, withRawSourceUrl: "true" }, signal);
    const refreshed = page.results.find((r) => r["id"] === key);
    url = text(refreshed?.["raw_source_url"]);
  }
  if (!url) {
    throw new Error(
      "Readwise no longer provides this source file. Scan again or use its full-file export.",
    );
  }
  const blob = await downloadReadwiseFile(url, signal);
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const valid =
    category === "pdf"
      ? new TextDecoder().decode(head) === "%PDF-"
      : head[0] === 80 && head[1] === 75;
  if (!valid) {
    throw new Error("Downloaded file does not match the expected PDF/EPUB format.");
  }
  return blob;
}
