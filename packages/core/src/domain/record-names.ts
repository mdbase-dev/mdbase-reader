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
const spacelessQuoteClusters = 16;
const chapterTitleCodePoints = 24;
const attachmentStemCodePoints = 32;
const typeCodePoints = 16;

const spacelessScript =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * What the engine refuses in a path as invisible or ignored by HFS+ (`is_ignorable` in mdbase's
 * `crates/core/src/paths.rs`). Some are letters or marks, such as the Hangul fillers and the
 * variation selectors, so the letter classes alone do not keep them out of a slug.
 */
const ignorableRanges: CodePointRanges = [
  [0xad, 0xad],
  [0x34f, 0x34f],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff0, 0xfff8],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

/**
 * The ignorable characters that sit inside a word and are dropped without a trace: fillers,
 * variation selectors, joiners, the soft hyphen and tags. The others (zero-width space, the
 * non-joiner, bidi controls) separate words, as any other non-letter does.
 */
const droppedRanges: CodePointRanges = [
  [0xad, 0xad],
  [0x34f, 0x34f],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200d, 0x200d],
  [0x2060, 0x2060],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xe0000, 0xe0fff],
];

/** Canonical combining class 9 (virama), from the engine's Unicode 17 tables. */
const viramas: ReadonlySet<number> = new Set([
  0x94d, 0x9cd, 0xa4d, 0xacd, 0xb4d, 0xbcd, 0xc4d, 0xccd, 0xd3b, 0xd3c, 0xd4d, 0xdca, 0xe3a, 0xeba,
  0xf84, 0x1039, 0x103a, 0x1714, 0x1715, 0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2,
  0x1bf3, 0x2d7f, 0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed, 0x10a3f, 0x11046, 0x11070,
  0x1107f, 0x110b9, 0x11133, 0x11134, 0x111c0, 0x11235, 0x112ea, 0x1134d, 0x113ce, 0x113cf, 0x113d0,
  0x11442, 0x114c2, 0x115bf, 0x1163f, 0x116b6, 0x1172b, 0x11839, 0x1193d, 0x1193e, 0x119e0, 0x11a34,
  0x11a47, 0x11a99, 0x11c3f, 0x11d44, 0x11d45, 0x11d97, 0x11f41, 0x11f42, 0x1612f,
]);

const zeroWidthJoiner = 0x200d;

/** Never cut before these, besides marks, selectors and skin tones: ZWNJ, ZWJ, sara am. */
const extraAttaching: ReadonlySet<number> = new Set([0x200c, zeroWidthJoiner, 0xe33, 0xeb3]);

/** Hangul jamo kinds by range; precomposed syllables are worked out from their code point. */
const jamoRanges: readonly (readonly [number, number, Jamo])[] = [
  [0x1100, 0x115f, "L"],
  [0xa960, 0xa97c, "L"],
  [0x1160, 0x11a7, "V"],
  [0xd7b0, 0xd7c6, "V"],
  [0x11a8, 0x11ff, "T"],
  [0xd7cb, 0xd7fb, "T"],
];

type CodePointRanges = readonly (readonly [number, number])[];

function inRanges(character: string, ranges: CodePointRanges): boolean {
  const point = character.codePointAt(0) ?? 0;
  return ranges.some(([low, high]) => point >= low && point <= high);
}

/**
 * A lowercase NFC slug: letters, combining marks and digits from any script, joined by `-`, cut
 * to `maxCodePoints` and {@link maxNameBytes} without splitting a character from its marks (see
 * {@link truncate}). Empty when nothing is left.
 *
 * Marks are kept only on a kept letter or digit, so a stray leading accent does not survive
 * alone. Characters the engine refuses as ignorable never appear in the result. `toLowerCase`,
 * not `toLocaleLowerCase`, so every locale names a record the same way.
 */
export function slug(text: string, maxCodePoints: number): string {
  const folded = text.normalize("NFKC").toLowerCase().normalize("NFKC").replace(/['’]/gu, "");
  let joined = "";
  let separated = false;
  let inWord = false;
  for (const character of folded) {
    if (inRanges(character, droppedRanges)) {
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(character)) {
      if (separated && joined) {
        joined += "-";
      }
      joined += character;
      separated = false;
      inWord = true;
    } else if (/\p{M}/u.test(character)) {
      if (inWord) {
        joined += character;
      }
    } else {
      separated = true;
      inWord = false;
    }
  }
  // Dropping characters between marks can leave them out of canonical order.
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
 * Whether the engine's `check_path` (mdbase `crates/core/src/paths.rs`) refuses `name` as one
 * path segment (file or folder, with or without extension): empty or over 255 bytes; a leading
 * dot (hidden, `.`, `..`, `.mdbase`); a character Windows forbids, a separator, a control
 * character (C0, DEL, C1) or an ignorable one; a trailing dot or space; a Windows device name as
 * its first dot-segment (`con`, `nul.md`, `com¹`, `conin$`, `clock$`); an NTFS short-name shape
 * (`git~1`); or `node_modules`. Collisions are checked separately, by {@link pathKey}.
 */
export function isReservedName(name: string): boolean {
  if (name.length === 0 || utf8Bytes(name) > 255 || name.startsWith(".")) {
    return true;
  }
  if (
    /[<>:"/\\|?*\p{Cc}]/u.test(name) ||
    Array.from(name).some((character) => inRanges(character, ignorableRanges)) ||
    /[. ]$/u.test(name)
  ) {
    return true;
  }
  return isReservedDevice(name) || isShortName(name) || reservedNameEquals(name, "node_modules");
}

/** The engine's `is_reserved_device`: ASCII-only case, on the stem before the first `.`. */
function isReservedDevice(name: string): boolean {
  const stem = (name.split(".")[0] ?? "").replace(/ +$/u, "");
  if (utf8Bytes(stem) > 7) {
    return false;
  }
  if (/^(?:con|prn|aux|nul|conin\$|conout\$|clock\$)$/u.test(asciiLower(stem))) {
    return true;
  }
  const characters = Array.from(stem);
  return (
    characters.length === 4 &&
    /^(?:com|lpt)$/u.test(asciiLower(characters.slice(0, 3).join(""))) &&
    /^[0-9¹²³]$/u.test(characters[3] ?? "")
  );
}

/** The engine's `is_short_name`: 1–6 characters, `~`, a number, and an extension of up to 3. */
function isShortName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  if (dot > 0 && Array.from(name.slice(dot + 1)).length > 3) {
    return false;
  }
  const tilde = base.lastIndexOf("~");
  const length = Array.from(base.slice(0, Math.max(tilde, 0))).length;
  return (
    tilde >= 0 && length >= 1 && length <= 6 && /^[1-9][0-9]{0,5}$/u.test(base.slice(tilde + 1))
  );
}

/** The engine's `reserved_name_eq`: ASCII case, plus long s and the Kelvin sign. */
function reservedNameEquals(name: string, reserved: string): boolean {
  return asciiLower(name.replace(/ſ/gu, "s").replace(/\u212a/gu, "k")) === reserved;
}

function asciiLower(text: string): string {
  return text.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
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
 * `adam.md`, `ß`, `ẞ` and `ss`). The engine stays authoritative.
 *
 * Each code point is upper- then lowercased on its own, so no context rule (final sigma) applies.
 * That gives the same classes as the engine's Unicode 17 full folding for every code point, with
 * two exceptions fixed here: `ı` folds to itself, not `i`, and `ẞ` folds to `ss`. The key text
 * itself can differ (Cherokee folds to uppercase in the engine), and characters newer than the
 * runtime's Unicode tables do not fold.
 */
export function pathKey(path: string): string {
  return Array.from(path.normalize("NFC"), foldCase).join("").normalize("NFC");
}

function foldCase(character: string): string {
  if (character === "ı") {
    return character;
  }
  return character === "ẞ" ? "ss" : character.toUpperCase().toLowerCase();
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
    candidates.push(nameWithSuffix(short, `-${family}-${year}`));
  }
  return finish([...candidates, ...withIdSuffixes(title, input.id, 4, 8)], input.id);
}

/** The most folders a preferred source note name may put it in, under `sources/`. */
export const maxPreferredFolders = 3;

/**
 * A name someone chose, such as a rendered name template, made safe as one path segment: NFC;
 * characters the engine refuses (Windows' `<>:"/\|?*`, controls, ignorables) become spaces;
 * runs of white space become one space; no leading or trailing dot or space; at most
 * {@link maxNameBytes}, cut where {@link nameClusters} allows. Case, spaces and punctuation
 * otherwise stay as written. Empty when nothing usable is left or the result is a
 * {@link isReservedName reserved name}.
 */
export function safeName(text: string): string {
  let spaced = "";
  for (const character of text.normalize("NFC")) {
    if (inRanges(character, droppedRanges)) {
      continue;
    }
    spaced +=
      /[<>:"/\\|?*\p{Cc}]/u.test(character) || inRanges(character, ignorableRanges)
        ? " "
        : character;
  }
  const trimEnds = (value: string): string => value.replace(/^[. ]+|[. ]+$/gu, "");
  const collapsed = trimEnds(spaced.replace(/\s+/gu, " "));
  const name = trimEnds(truncate(collapsed, Number.MAX_SAFE_INTEGER, maxNameBytes)).normalize(
    "NFC",
  );
  return isReservedName(name) ? "" : name;
}

/**
 * Stems (relative to `sources/`, without `.md`) for a new source note whose preferred name is
 * `preferred`, such as a rendered name template. `/` separates folders, at most
 * {@link maxPreferredFolders} of them; each segment goes through {@link safeName}, and empty
 * segments are dropped. The preferred leaf comes first, then the same fallbacks as
 * {@link sourceNoteStems} built from it in the same folder (author and year, then 4 and 8
 * characters of the ID), then the ID. A preferred name that is empty, unusable or nested too deep
 * gives {@link sourceNoteStems} unchanged, and so does one equal to its first stem.
 */
export function preferredSourceNoteStems(
  preferred: string,
  input: Parameters<typeof sourceNoteStems>[0],
): readonly string[] {
  const defaults = sourceNoteStems(input);
  const segments = preferred.split("/").map(safeName).filter(Boolean);
  const leaf = segments.at(-1);
  if (!leaf || segments.length > maxPreferredFolders + 1) {
    return defaults;
  }
  const folder = segments.slice(0, -1).join("/");
  if (!folder && leaf === defaults[0]) {
    return defaults;
  }
  const family = input.authorYear ? slug(input.authorYear.family, authorFamilyCodePoints) : "";
  const year = input.authorYear ? yearToken(input.authorYear.year) : "";
  const leaves = unique([
    leaf,
    family && year ? nameWithSuffix(leaf, `-${family}-${year}`) : "",
    ...withIdSuffixes(leaf, input.id, 4, 8),
  ]).filter((name) => !isReservedName(name));
  return unique([...leaves.map((name) => (folder ? `${folder}/${name}` : name)), input.id]);
}

/**
 * Leaves for a new annotation whose preferred name is `preferred`: the name through
 * {@link safeName} (so a `/` is a space: annotations take no folders), then with 4 and 8
 * characters of the ID, then the ID. Empty or unusable gives the ID alone, Reader's default.
 */
export function preferredAnnotationLeaves(preferred: string, id: string): readonly string[] {
  const leaf = safeName(preferred);
  return leaf && leaf !== id ? finish([leaf, ...withIdSuffixes(leaf, id, 4, 8)], id) : [id];
}

/** `sources/<stem>.md` for each of {@link sourceNoteStems}. */
export function sourceNotePaths(input: Parameters<typeof sourceNoteStems>[0]): readonly string[] {
  return sourceNoteStems(input).map((stem) => `sources/${stem}.md`);
}

/** A candidate name for a new source: its note's stem and path, and its children's folder. */
export interface SourceNoteName {
  readonly stem: string;
  readonly path: string;
  /** The folder under `annotations/` and `files/reader/`: the stem as written. */
  readonly folder: string;
}

/**
 * {@link sourceNoteStems}, each with its note path and folder, in the same order. Folders are not
 * records, so the engine never refuses two sources one folder: take the first candidate whose
 * note path is free and whose folder no other source uses.
 */
export function sourceNoteNames(
  input: Parameters<typeof sourceNoteStems>[0],
): readonly SourceNoteName[] {
  return sourceNoteStems(input).map((stem) => ({ stem, path: `sources/${stem}.md`, folder: stem }));
}

/**
 * Folder candidates, in order, for the children of an existing source whose note has the stem
 * `sourceStem`. A stem as the generator writes it (or the source's ID) is the folder as written.
 * A stem the user renamed goes through `slug(…, 60)`: `Adam (Kingma 2014)` gives
 * `adam-kingma-2014`. Then come 4 and 8 characters of the source ID, then the ID.
 *
 * Take the first folder that no other source uses: a renamed `Adam!` and another source's `adam`
 * both start from `adam`.
 */
export function sourceFolderNames(sourceStem: string, sourceId: string): readonly string[] {
  if (sourceStem === sourceId) {
    return [sourceId];
  }
  const generated =
    !isReservedName(sourceStem) && slug(sourceStem, Number.MAX_SAFE_INTEGER) === sourceStem;
  const folder = generated ? sourceStem : slug(sourceStem, sourceTitleCodePoints);
  return folder
    ? finish([folder, ...withIdSuffixes(folder, sourceId, 4, 8)], sourceId)
    : [sourceId];
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

/**
 * `annotations/<source folder>/<leaf>.md` for each of {@link annotationLeaves}. `sourceFolder`
 * is the source's chosen folder, from {@link sourceNoteNames} or {@link sourceFolderNames}.
 */
export function annotationPaths(
  input: AnnotationNameInput & { readonly sourceFolder: string },
): readonly string[] {
  return annotationLeaves(input).map((leaf) => `annotations/${input.sourceFolder}/${leaf}.md`);
}

/** How a file relates to its source, which decides its name in the source's folder. */
export type SourceFileRole = "primary" | "archive" | "alternative";

/**
 * Paths for a source's file in `files/reader/<source folder>/`, named after the folder: the
 * readable name, then the same with 4 and 8 characters of the transfer ID before the extension.
 *
 * - primary PDF, EPUB or web capture: `<folder>.<ext>`;
 * - web archive: `<folder>.archive.html`;
 * - alternative attachment: `<folder>-<original stem>.<ext>`.
 */
export function sourceFilePaths(input: {
  readonly sourceFolder: string;
  readonly role: SourceFileRole;
  readonly extension: string;
  readonly transferId: string;
  readonly originalName?: string | undefined;
}): readonly string[] {
  const folder = input.sourceFolder;
  const extension = input.role === "archive" ? "archive.html" : extensionToken(input.extension);
  const original =
    input.role === "alternative"
      ? slug((input.originalName ?? "").replace(/\.[^.]*$/u, ""), attachmentStemCodePoints)
      : "";
  const stem = original ? nameWithSuffix(folder, `-${original}`) : folder;
  return fileCandidates(`files/reader/${folder}`, stem, extension, input.transferId);
}

/**
 * Paths for an area capture's image, beside its source's files and named after the annotation's
 * chosen leaf, with 4 and 8 characters of the transfer ID as fallbacks.
 */
export function areaCapturePaths(input: {
  readonly sourceFolder: string;
  readonly annotationLeaf: string;
  readonly transferId: string;
}): readonly string[] {
  return fileCandidates(
    `files/reader/${input.sourceFolder}`,
    input.annotationLeaf,
    "png",
    input.transferId,
  );
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
 * 16 {@link nameClusters} instead. A single long word in another script is cut at 40 code points.
 */
export function quoteWords(text: string): string {
  const trimmed = text.normalize("NFKC").trim();
  const folded = slug(trimmed, Number.MAX_SAFE_INTEGER);
  if (!/\s/u.test(trimmed) && spacelessScript.test(trimmed)) {
    return truncate(folded, Number.MAX_SAFE_INTEGER, maxNameBytes, spacelessQuoteClusters);
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
    .map((suffix) => nameWithSuffix(base, `-${suffix}`));
}

/**
 * `base`, cut as {@link truncate} does, followed by `suffix`, within {@link maxNameBytes}.
 * Unchanged when it already fits; empty when nothing of `base` is left.
 */
export function nameWithSuffix(base: string, suffix: string): string {
  const room = maxNameBytes - utf8Bytes(suffix);
  const cut = truncate(base, Number.MAX_SAFE_INTEGER, room);
  return cut ? `${cut}${suffix}` : "";
}

/** Drops unusable and repeated candidates; the ID always remains as the last resort. */
function finish(candidates: readonly string[], id: string): readonly string[] {
  return unique([...candidates.filter((name) => !isReservedName(name)), id]);
}

/**
 * Cuts `text` to at most `maxCodePoints` code points, `maxBytes` UTF-8 bytes and `maxClusters`
 * {@link nameClusters}, then trims `-` from both ends.
 */
function truncate(
  text: string,
  maxCodePoints: number,
  maxBytes: number,
  maxClusters = Number.MAX_SAFE_INTEGER,
): string {
  let kept = "";
  let points = 0;
  let bytes = 0;
  let count = 0;
  for (const cluster of nameClusters(text)) {
    const clusterPoints = Array.from(cluster).length;
    const clusterBytes = utf8Bytes(cluster);
    if (
      count === maxClusters ||
      points + clusterPoints > maxCodePoints ||
      bytes + clusterBytes > maxBytes
    ) {
      break;
    }
    count += 1;
    kept += cluster;
    points += clusterPoints;
    bytes += clusterBytes;
  }
  return kept.replace(/^-+|-+$/gu, "");
}

/**
 * `text` split where a name may be cut. A fixed code-point rule, not `Intl.Segmenter`, so every
 * runtime and ICU version cuts a name in the same place. Never cut:
 *
 * - before a mark, a variation selector, an emoji skin tone, ZWJ or ZWNJ;
 * - after a virama or ZWJ, before a letter or pictograph (conjuncts, emoji ZWJ sequences);
 * - inside a pair of regional indicators (a flag) or a Hangul jamo syllable.
 */
export function nameClusters(text: string): string[] {
  const result: string[] = [];
  let previous = "";
  let indicators = 0;
  for (const character of text) {
    const last = result.length - 1;
    const open = result[last];
    if (open !== undefined && joinsPrevious(previous, character, indicators)) {
      result[last] = `${open}${character}`;
    } else {
      result.push(character);
    }
    indicators = /\p{Regional_Indicator}/u.test(character) ? indicators + 1 : 0;
    previous = character;
  }
  return result;
}

function joinsPrevious(previous: string, character: string, indicators: number): boolean {
  const point = character.codePointAt(0) ?? 0;
  const previousPoint = previous.codePointAt(0) ?? 0;
  if (
    /[\p{M}\p{Variation_Selector}\p{Emoji_Modifier}]/u.test(character) ||
    extraAttaching.has(point)
  ) {
    return true;
  }
  if (
    (viramas.has(previousPoint) || previousPoint === zeroWidthJoiner) &&
    /[\p{L}\p{Extended_Pictographic}]/u.test(character)
  ) {
    return true;
  }
  if (/\p{Regional_Indicator}/u.test(character) && indicators % 2 === 1) {
    return true;
  }
  return hangulJoins(jamo(previousPoint), jamo(point));
}

type Jamo = "L" | "V" | "T" | "LV" | "LVT" | undefined;

function jamo(point: number): Jamo {
  if (point >= 0xac00 && point <= 0xd7a3) {
    return (point - 0xac00) % 28 === 0 ? "LV" : "LVT";
  }
  return jamoRanges.find(([low, high]) => point >= low && point <= high)?.[2];
}

function hangulJoins(previous: Jamo, next: Jamo): boolean {
  switch (previous) {
    case "L":
      return next !== undefined && next !== "T";
    case "V":
    case "LV":
      return next === "V" || next === "T";
    case "T":
    case "LVT":
      return next === "T";
    default:
      return false;
  }
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
