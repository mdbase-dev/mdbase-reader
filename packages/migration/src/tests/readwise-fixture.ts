import type { Fields } from "../model.js";
/** Synthetic Reader v3 `/api/v3/list/` rows, as documented, keyed by listing. */
export const readerDocument: Fields = {
  id: "01reader0doc0000000000000a",
  url: "https://read.readwise.io/read/01reader0doc0000000000000a",
  source_url: "https://example.org/essay",
  title: "An essay saved in Reader",
  author: "Ada Example",
  source: "Reader RSS",
  category: "article",
  location: "archive",
  tags: { essays: { name: "essays", type: "manual", created: 1767225600000 } },
  site_name: "example.org",
  word_count: 1200,
  created_at: "2026-01-02T10:00:00.000000+00:00",
  updated_at: "2026-01-03T10:00:00.000000+00:00",
  saved_at: "2026-01-02T10:00:00.000000+00:00",
  notes: "",
  summary: "An essay.",
  parent_id: null,
  reading_progress: 1,
  html_content: "<article><p>The saved article body.</p><p>Reader quote here.</p></article>",
};
export const readerHighlight: Fields = {
  id: "01reader0hl00000000000000a",
  category: "highlight",
  location: "archive",
  parent_id: readerDocument["id"] as string,
  content: "Reader quote here.",
  html_content: "<p>Reader quote here.</p>",
  notes: "",
  tags: {},
  created_at: "2026-01-02T11:00:00.000000+00:00",
};
/** A Reader highlight with no v2 counterpart yet (v2 export lags behind Reader). */
export const readerOnlyHighlight: Fields = {
  id: "01reader0hl00000000000000b",
  category: "highlight",
  location: "archive",
  parent_id: readerDocument["id"] as string,
  content: "The saved article body.",
  notes: "",
  tags: {},
  created_at: "2026-01-02T11:05:00.000000+00:00",
};
/** Highlight on an unsaved Feed document, which is not listed without the Feed. */
export const feedHighlight: Fields = {
  id: "01feed00hl00000000000000a",
  category: "highlight",
  location: "feed",
  parent_id: "01feed00doc0000000000000a",
  content: "Feed quote.",
  tags: {},
};
/** Synthetic `/api/v2/export/` books. */
export const readerBook: Fields = {
  user_book_id: 5001,
  is_deleted: false,
  title: "An essay saved in Reader",
  author: "Ada Example",
  readable_title: "An Essay Saved in Reader",
  source: "reader",
  cover_image_url: "https://example.org/cover.png",
  unique_url: "https://example.org/essay",
  book_tags: [],
  category: "articles",
  document_note: "",
  summary: "",
  readwise_url: "https://readwise.io/bookreview/5001",
  source_url: "https://example.org/essay",
  external_id: readerDocument["id"] as string,
  asin: null,
  highlights: [
    {
      id: 9001,
      is_deleted: false,
      text: "Reader quote here.",
      location: 2,
      location_type: "offset",
      note: "",
      color: "yellow",
      highlighted_at: "2026-01-02T11:00:00Z",
      created_at: "2026-01-02T11:00:10Z",
      updated_at: "2026-01-02T11:00:10Z",
      external_id: readerHighlight["id"] as string,
      tags: [],
      is_favorite: false,
      is_discard: false,
    },
  ],
};
export const kindleBook: Fields = {
  user_book_id: 7001,
  is_deleted: false,
  title: "The Example Book: A Novel",
  author: "Grace Example",
  readable_title: "The Example Book",
  source: "kindle",
  cover_image_url: "https://images-na.ssl-images-amazon.com/images/I/example.jpg",
  unique_url: null,
  book_tags: [{ id: 1, name: "fiction" }],
  category: "books",
  document_note: "Read on holiday; revisit chapter 3.",
  summary: null,
  readwise_url: "https://readwise.io/bookreview/7001",
  source_url: null,
  external_id: null,
  asin: "B000EXAMPLE",
  highlights: [
    {
      id: 11001,
      is_deleted: false,
      text: "It was the first line of a novel.",
      location: 152,
      location_type: "location",
      note: "Good opening",
      color: "blue",
      highlighted_at: "2025-06-01T20:15:00Z",
      created_at: "2025-06-03T08:00:00Z",
      updated_at: "2025-06-03T08:00:00Z",
      external_id: null,
      end_location: null,
      url: null,
      book_id: 7001,
      tags: [{ id: 9, name: "favorite" }],
      is_favorite: true,
      is_discard: false,
    },
    {
      id: 11002,
      is_deleted: false,
      text: "A later passage,\nover two lines.",
      location: 2310,
      location_type: "location",
      note: "",
      color: "yellow",
      highlighted_at: null,
      created_at: "2025-06-04T09:00:00Z",
      updated_at: "2025-06-04T09:00:00Z",
      external_id: null,
      book_id: 7001,
      tags: [],
      is_favorite: false,
      is_discard: false,
    },
    {
      id: 11003,
      is_deleted: false,
      text: "A highlight the user discarded.",
      location: 3000,
      location_type: "location",
      note: "",
      color: "yellow",
      highlighted_at: "2025-06-05T09:00:00Z",
      external_id: null,
      book_id: 7001,
      tags: [],
      is_discard: true,
    },
  ],
};
export const podcastBook: Fields = {
  user_book_id: 7002,
  is_deleted: false,
  title: "Episode 12: Examples",
  author: "Example Podcast",
  readable_title: "Episode 12: Examples",
  source: "snipd",
  cover_image_url: null,
  book_tags: [],
  category: "podcasts",
  document_note: null,
  source_url: "https://podcasts.example/episode-12",
  external_id: null,
  asin: null,
  highlights: [
    {
      id: 12001,
      is_deleted: false,
      text: "Something said at minute three.",
      location: 185,
      location_type: "time_offset",
      note: "",
      color: "",
      highlighted_at: "2025-07-01T12:00:00Z",
      external_id: null,
      tags: [],
      is_discard: false,
    },
  ],
};
export const deletedBook: Fields = {
  user_book_id: 7003,
  is_deleted: true,
  title: "Removed",
  source: "instapaper",
  category: "articles",
  highlights: [],
};
/** A Reader-sourced v2 book whose document is an unsaved Feed item. */
export const feedBook: Fields = {
  user_book_id: 5002,
  is_deleted: false,
  title: "Feed item",
  source: "reader",
  category: "articles",
  external_id: "01feed00doc0000000000000a",
  highlights: [
    {
      id: 9101,
      text: "Feed quote.",
      location: 1,
      location_type: "offset",
      external_id: feedHighlight["id"] as string,
    },
  ],
};
/** Routes fixture requests by endpoint and documented query parameters. */
export function readwiseResponses(url: URL): Fields {
  if (url.pathname === "/api/v2/export/") {
    // Two export pages; the first cursor is numeric to prove either form is followed.
    return url.searchParams.get("pageCursor") === "7002"
      ? { count: 5, nextPageCursor: null, results: [podcastBook, deletedBook, feedBook] }
      : { count: 5, nextPageCursor: 7002, results: [readerBook, kindleBook] };
  }
  const location = url.searchParams.get("location");
  const category = url.searchParams.get("category");
  if (location === "feed") {
    return { count: 42, nextPageCursor: null, results: [] };
  }
  const results =
    location === "archive"
      ? [readerDocument, readerHighlight, readerOnlyHighlight]
      : category === "highlight"
        ? [readerHighlight, readerOnlyHighlight, feedHighlight]
        : [];
  return { count: results.length, nextPageCursor: null, results };
}
