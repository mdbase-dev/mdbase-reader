/**
 * Readable names for the records and files Reader creates (`docs/design/file-layout.md` §3).
 *
 * Paths are for people and IDs are for the app: nothing here is ever parsed back out of a path.
 * Every generator returns its candidates in order of preference; the caller creates at the first
 * one that is free. Names are computed once, from structured fields, when a record is created.
 */
import type { AnnotationType } from "./annotation.js";
import type { AnnotationTarget } from "./selector.js";

/** The most UTF-8 bytes in a generated name, before any extension. Under eCryptfs's 143. */
export const maxNameBytes = 120;

const sourceTitleCodePoints = 60;
const authorYearTitleCodePoints = 48;
const authorFamilyCodePoints = 16;
const annotationLeafCodePoints = 64;
const quoteWordCount = 6;
const quoteWordCodePoints = 40;
const spacelessQuoteGraphemes = 16;
const chapterTitleCodePoints = 24;
const attachmentStemCodePoints = 32;
const typeCodePoints = 16;

const spacelessScript =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * A lowercase NFC slug: letters, combining marks and digits from any script, joined by `-`, cut
 * at a grapheme boundary to `maxCodePoints` and {@link maxNameBytes}. Empty when nothing is left.
 *
 * Marks are kept only on a kept letter or digit, so an emoji's variation selector or a stray
 * leading accent does not survive alone. Variation selectors are dropped: they only choose a
 * glyph. `toLowerCase`, not `toLocaleLowerCase`, so every locale names a record the same way.
 */
export function slug(text: string, maxCodePoints: number): string {
  const folded = text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/gu, "")
    .replace(/\p{Variation_Selector}/gu, "");
  let joined = "";
  let separated = false;
  for (const { segment } of graphemes.segment(folded)) {
    if (/^[\p{L}\p{N}]/u.test(segment)) {
      if (separated && joined) {
        joined += "-";
      }
      joined += segment.replace(/[^\p{L}\p{M}\p{N}]/gu, "");
      separated = false;
    } else {
      separated = true;
    }
  }
  // Dropping joiners between marks can leave them out of canonical order.
  return truncate(joined.normalize("NFC"), maxCodePoints, maxNameBytes).normalize("NFC");
}

/** UTF-8 length of `text`, counted without an encoder. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Whether a name (file or folder, with or without extension) cannot be created on every replica:
 * empty, a Windows device name as its first dot-segment (`con`, `nul.md`, `com¹`), a character
 * Windows forbids or a control character, a leading dot, or a trailing dot or space.
 */
export function isReservedName(name: string): boolean {
  if (name.length === 0 || name.startsWith(".") || /[. ]$/u.test(name)) {
    return true;
  }
  // eslint-disable-next-line no-control-regex -- control characters are what is being refused.
  if (/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(name)) {
    return true;
  }
  const device = (name.split(".")[0] ?? "").trimEnd().toLowerCase();
  return /^(?:con|prn|aux|nul|(?:com|lpt)[0-9¹²³])$/u.test(device);
}

/**
 * The last `length` letters and digits of a record's own ID, lowercased: the random end of a
 * UUID, v4 or v7. The same on every retry of one record, and different between two records.
 */
export function idSuffix(id: string, length: 4 | 8): string {
  const characters = Array.from(
    id
      .toLowerCase()
      .replace(/^[a-z]+_/u, "")
      .replace(/[^a-z0-9]/gu, ""),
  );
  return characters.slice(-length).join("");
}

/**
 * An approximation of the engine's path key, `NFC(casefold_full(NFC(path)))`, for planning many
 * names at once without proposing two that the engine would treat as one (`Adam.md` and
 * `adam.md`, `ß` and `ss`). The engine stays authoritative.
 */
export function pathKey(path: string): string {
  return path.normalize("NFC").toUpperCase().toLowerCase().replace(/ς/gu, "σ").normalize("NFC");
}

/** The first candidate whose {@link pathKey} is not in `takenKeys`, or undefined. */
export function firstFreePath(
  candidates: readonly string[],
  takenKeys: ReadonlySet<string>,
): string | undefined {
  return candidates.find((candidate) => !takenKeys.has(pathKey(candidate)));
}

/** The first author's family name and the year, for telling apart sources with one title. */
export interface AuthorYear {
  readonly family: string;
  readonly year: number | string;
}

/**
 * The first author's (else editor's) family or literal name and the issued year of a CSL item,
 * when it has both.
 */
export function authorYearFromCsl(csl: Readonly<Record<string, unknown>>): AuthorYear | undefined {
  const names = [csl["author"], csl["editor"]].find(
    (value): value is readonly unknown[] => Array.isArray(value) && value.length > 0,
  );
  const first = record(names?.[0]);
  const family = text(first?.["family"]) ?? text(first?.["literal"]);
  const year = issuedYear(record(csl["issued"]));
  return family && year ? { family: family.trim(), year } : undefined;
}

function issuedYear(issued: Readonly<Record<string, unknown>> | undefined): string {
  const parts = issued?.["date-parts"];
  const head: unknown = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
  if (typeof head === "number" || typeof head === "string") {
    return yearToken(head);
  }
  return yearToken(text(issued?.["raw"]) ?? text(issued?.["literal"]) ?? "");
}

/**
 * Stems (names without `.md`) for a new source note under `sources/`, in order:
 * the title; title, author and year; the title with 4, then 8 characters of the ID; the ID.
 * Chapters and other parts use the same rules: a part is just a source.
 */
export function sourceNoteStems(input: {
  readonly title: string;
  readonly id: string;
  readonly authorYear?: AuthorYear | undefined;
}): readonly string[] {
  const title = slug(input.title, sourceTitleCodePoints);
  if (!title) {
    return [input.id];
  }
  const candidates = [title];
  const family = input.authorYear ? slug(input.authorYear.family, authorFamilyCodePoints) : "";
  const year = input.authorYear ? yearToken(input.authorYear.year) : "";
  if (family && year) {
    const short = slug(input.title, authorYearTitleCodePoints);
    candidates.push(withSuffix(short, `-${family}-${year}`));
  }
  return finish([...candidates, ...withIdSuffixes(title, input.id, 4, 8)], input.id);
}

/** `sources/<stem>.md` for each of {@link sourceNoteStems}. */
export function sourceNotePaths(input: Parameters<typeof sourceNoteStems>[0]): readonly string[] {
  return sourceNoteStems(input).map((stem) => `sources/${stem}.md`);
}

/**
 * The folder name for a source's children: its note's current stem when that is already
 * slug-shaped, otherwise the stem made into one (a note renamed `Adam (Kingma 2014)` gives
 * `adam-kingma-2014`). Falls back to the source ID.
 */
export function sourceFolderName(sourceStem: string, sourceId: string): string {
  if (!isReservedName(sourceStem) && slug(sourceStem, sourceTitleCodePoints) === sourceStem) {
    return sourceStem;
  }
  const folder = slug(sourceStem, sourceTitleCodePoints);
  return folder && !isReservedName(folder) ? folder : sourceId;
}

/** The stem of a record path: `sources/adam.md` gives `adam`. */
export function pathStem(path: string): string {
  return (path.split("/").at(-1) ?? "").replace(/\.md$/u, "");
}

/** What an annotation's name is computed from. All of it is structured; no `locator.label`. */
export interface AnnotationNameInput {
  readonly id: string;
  readonly annotationType: AnnotationType;
  readonly target?: AnnotationTarget | undefined;
  readonly body?: string | undefined;
}

/**
 * Leaves (names without folder or `.md`) for a new annotation, in order: the readable leaf, then
 * with 4 and 8 characters of the annotation ID, then the ID. See the table in §3 of the design.
 */
export function annotationLeaves(input: AnnotationNameInput): readonly string[] {
  const leaf = truncate(annotationLeaf(input), annotationLeafCodePoints, maxNameBytes);
  return finish([leaf, ...withIdSuffixes(leaf, input.id, 4, 8)], input.id);
}

/** `annotations/<source folder>/<leaf>.md` for each of {@link annotationLeaves}. */
export function annotationPaths(
  input: AnnotationNameInput & { readonly sourceStem: string; readonly sourceId: string },
): readonly string[] {
  const folder = sourceFolderName(input.sourceStem, input.sourceId);
  return annotationLeaves(input).map((leaf) => `annotations/${folder}/${leaf}.md`);
}

/** How a file relates to its source, which decides its name in the source's folder. */
export type SourceFileRole = "primary" | "archive" | "alternative";

/**
 * Paths for a source's file in `files/reader/<source folder>/`: the readable name, then the same
 * with 4 and 8 characters of the transfer ID before the extension.
 *
 * - primary PDF, EPUB or web capture: `<stem>.<ext>`;
 * - web archive: `<stem>.archive.html`;
 * - alternative attachment: `<stem>-<original stem>.<ext>`.
 */
export function sourceFilePaths(input: {
  readonly sourceStem: string;
  readonly sourceId: string;
  readonly role: SourceFileRole;
  readonly extension: string;
  readonly transferId: string;
  readonly originalName?: string | undefined;
}): readonly string[] {
  const folder = sourceFolderName(input.sourceStem, input.sourceId);
  const extension = input.role === "archive" ? "archive.html" : extensionToken(input.extension);
  const original =
    input.role === "alternative"
      ? slug((input.originalName ?? "").replace(/\.[^.]*$/u, ""), attachmentStemCodePoints)
      : "";
  const stem = original ? withSuffix(folder, `-${original}`) : folder;
  return fileCandidates(`files/reader/${folder}`, stem, extension, input.transferId);
}

/**
 * Paths for an area capture's image, beside its source's files and named after the annotation's
 * chosen leaf, with 4 and 8 characters of the transfer ID as fallbacks.
 */
export function areaCapturePaths(input: {
  readonly sourceStem: string;
  readonly sourceId: string;
  readonly annotationLeaf: string;
  readonly transferId: string;
}): readonly string[] {
  const folder = sourceFolderName(input.sourceStem, input.sourceId);
  return fileCandidates(`files/reader/${folder}`, input.annotationLeaf, "png", input.transferId);
}

function annotationLeaf({ annotationType, target, body }: AnnotationNameInput): string {
  const page = pageToken(target);
  const quote = target?.quote?.exact ? quoteWords(target.quote.exact) : "";
  const bodyWords = body ? quoteWords(body) : "";
  switch (annotationType) {
    case "bookmark":
      return bookmarkLeaf(target, page);
    case "area":
      return joinTokens(page, "area", bodyWords);
    case "highlight":
      return joinTokens(page, quote || "highlight");
    case "note":
      // A comment on a passage is named like a highlight; one on the whole source by its body.
      return quote ? joinTokens(page, quote) : joinTokens("note", bodyWords);
    default:
      return joinTokens(slug(annotationType, typeCodePoints) || "annotation", quote || bodyWords);
  }
}

function bookmarkLeaf(target: AnnotationTarget | undefined, page: string): string {
  if (page) {
    return `bookmark-${page}`;
  }
  const position = target?.position;
  if (position?.kind === "epub") {
    const title = slug(text(position.locator["title"]) ?? "", chapterTitleCodePoints);
    if (title) {
      return `bookmark-${title}`;
    }
    const locations = record(position.locator["locations"]);
    const progression =
      number(locations?.["totalProgression"]) ?? number(locations?.["progression"]);
    return progression === undefined ? "bookmark" : `bookmark-${percent(progression)}`;
  }
  if (position?.kind === "html" && position.progression !== undefined) {
    return `bookmark-${percent(position.progression)}`;
  }
  return "bookmark";
}

/**
 * Up to 6 whole words or 40 code points of `text`, whichever comes first. Text with no spaces in
 * a script written without them (Chinese, Japanese, Thai, Lao, Khmer, Myanmar) gives its first
 * 16 graphemes instead. A single long word in another script is cut at 40 code points.
 */
export function quoteWords(text: string): string {
  const trimmed = text.normalize("NFKC").trim();
  const folded = slug(trimmed, Number.MAX_SAFE_INTEGER);
  if (!/\s/u.test(trimmed) && spacelessScript.test(trimmed)) {
    return truncate(folded, Number.MAX_SAFE_INTEGER, maxNameBytes, spacelessQuoteGraphemes);
  }
  let joined = "";
  for (const word of folded.split("-").slice(0, quoteWordCount)) {
    const next = joined ? `${joined}-${word}` : word;
    if (Array.from(next).length > quoteWordCodePoints) {
      return joined || truncate(word, quoteWordCodePoints, maxNameBytes);
    }
    joined = next;
  }
  return joined;
}

function fileCandidates(
  folder: string,
  stem: string,
  extension: string,
  transferId: string,
): readonly string[] {
  const stems = [stem, ...withIdSuffixes(stem, transferId, 4, 8)];
  return unique(stems.filter((name) => !isReservedName(name))).map(
    (name) => `${folder}/${name}.${extension}`,
  );
}

/** `base` with each ID suffix appended, cut so that every result fits {@link maxNameBytes}. */
function withIdSuffixes(base: string, id: string, ...lengths: readonly (4 | 8)[]): string[] {
  return lengths
    .map((length) => idSuffix(id, length))
    .filter(Boolean)
    .map((suffix) => withSuffix(base, `-${suffix}`));
}

/** `base` cut at a grapheme boundary so that `base + suffix` fits {@link maxNameBytes}. */
function withSuffix(base: string, suffix: string): string {
  const room = maxNameBytes - utf8Bytes(suffix);
  const cut = truncate(base, Number.MAX_SAFE_INTEGER, room);
  return cut ? `${cut}${suffix}` : "";
}

/** Drops unusable and repeated candidates; the ID always remains as the last resort. */
function finish(candidates: readonly string[], id: string): readonly string[] {
  return unique([...candidates.filter((name) => !isReservedName(name)), id]);
}

/**
 * Cuts `text` at a grapheme boundary to at most `maxCodePoints` code points, `maxBytes` UTF-8
 * bytes and `maxGraphemes` graphemes, then trims `-` from both ends.
 */
function truncate(
  text: string,
  maxCodePoints: number,
  maxBytes: number,
  maxGraphemes = Number.MAX_SAFE_INTEGER,
): string {
  let kept = "";
  let points = 0;
  let bytes = 0;
  let count = 0;
  for (const { segment } of graphemes.segment(text)) {
    const segmentPoints = Array.from(segment).length;
    const segmentBytes = utf8Bytes(segment);
    if (
      count === maxGraphemes ||
      points + segmentPoints > maxCodePoints ||
      bytes + segmentBytes > maxBytes
    ) {
      break;
    }
    count += 1;
    kept += segment;
    points += segmentPoints;
    bytes += segmentBytes;
  }
  return kept.replace(/^-+|-+$/gu, "");
}

function joinTokens(...tokens: readonly string[]): string {
  return tokens.filter(Boolean).join("-");
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = pathKey(value);
    if (!value || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * `p<n>`, the one-based page of a PDF target from its geometry or its bookmark position, or
 * empty for EPUB and HTML, which get no locator token.
 */
function pageToken(target: AnnotationTarget | undefined): string {
  const index =
    target?.pdf?.pageIndex ??
    (target?.position?.kind === "pdf" ? target.position.pageIndex : undefined);
  return index !== undefined && Number.isInteger(index) && index >= 0
    ? `p${String(index + 1)}`
    : "";
}

function yearToken(year: number | string): string {
  if (typeof year === "number") {
    return Number.isInteger(year) && year > 0 && year < 10_000 ? String(year) : "";
  }
  return /(?<!\d)\d{4}(?!\d)/u.exec(year.normalize("NFKC"))?.[0] ?? "";
}

function extensionToken(extension: string): string {
  return slug(extension.replace(/^\./u, ""), 16) || "bin";
}

function percent(progression: number): string {
  return `${String(Math.round(Math.min(1, Math.max(0, progression)) * 100))}pct`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
