import {
  array,
  identity,
  object,
  stamp,
  text,
  type Fields,
  type MigrationSource,
} from "./model.js";
import { scalar, tagNames } from "./readwise-values.js";
/** Readwise v2 categories; anything else keeps its own name. */
const kinds: Record<string, string> = {
  books: "book",
  articles: "article",
  tweets: "post",
  podcasts: "podcast",
  supplementals: "document",
};
/** Import key for a v2 book. Reader document IDs never contain a colon, so these cannot collide. */
export function classicKey(book: Fields): string {
  const id = scalar(book["user_book_id"]);
  return id ? `v2-book:${id}` : "";
}
/** Book metadata without its highlights; each highlight is archived on its own annotation. */
export function bookMetadata(book: Fields): Fields {
  const result = { ...book };
  delete result["highlights"];
  return result;
}
/**
 * A source for a book that exists only in classic Readwise (Kindle, Apple Books, Instapaper,
 * podcasts, tweets, manual entries…). These have no stored file, only metadata and highlights.
 */
export async function classicSource(book: Fields, namespace: string): Promise<MigrationSource> {
  const key = classicKey(book);
  const id = await identity(namespace, key);
  const category = text(book["category"]);
  const asin = text(book["asin"]);
  const cover = text(book["cover_image_url"]);
  return {
    key,
    id,
    path: `sources/imports/${id}.md`,
    body: "",
    documents: [],
    fields: {
      title:
        text(book["readable_title"]).trim() ||
        text(book["title"]).trim() ||
        "Untitled Readwise book",
      kind: kinds[category] ?? (category || "document"),
      saved_at: earliestHighlight(book),
      authors: text(book["author"]) ? [text(book["author"])] : [],
      url: text(book["source_url"]),
      tags: tagNames(book["book_tags"]),
      description: text(book["summary"]),
      ...(cover ? { cover_url: cover } : {}),
      ...(asin ? { identifiers: { asin } } : {}),
      import: { service: "readwise", namespace, key, native: bookMetadata(book) },
    },
  };
}
/** v2 books carry no save date; the first highlight is the closest stable evidence. */
function earliestHighlight(book: Fields): string {
  const times = array(book["highlights"] ?? [])
    .map((h) => {
      const highlight = object(h);
      return Date.parse(stamp(highlight["highlighted_at"] ?? highlight["created_at"], ""));
    })
    .filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : stamp(null);
}
