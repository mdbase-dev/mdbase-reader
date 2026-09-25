import { cslDate, sanitizedCitation, type CitationDraft, type CslName } from "./csl-values.js";

/**
 * Converts one item in Zotero's API JSON (what translation-server and Citoid return) to CSL,
 * following the mappings Zotero itself uses for CSL export. Fields CSL cannot hold are dropped.
 */
export function cslFromZoteroItem(item: Readonly<Record<string, unknown>>): CitationDraft {
  const citation: Record<string, unknown> = {
    type: itemTypes[text(item["itemType"]) ?? ""] ?? "document",
  };
  for (const [zoteroField, value] of Object.entries(item)) {
    const field = fieldMap[zoteroField];
    const content = text(value);
    if (field && content && citation[field] === undefined) {
      citation[field] = content;
    }
  }
  if (typeof citation["page"] === "string") {
    citation["page"] = citation["page"].replaceAll("–", "-");
  }
  const date = text(item["date"]);
  const accessed = cslDate(text(item["accessDate"]));
  Object.assign(citation, {
    ...(date ? { issued: cslDate(date) ?? { literal: date } } : {}),
    ...(accessed ? { accessed } : {}),
    ...creators(item["creators"]),
    ...extraIdentifiers(text(item["extra"])),
  });
  const tags = Array.isArray(item["tags"])
    ? item["tags"].flatMap((tag: unknown) => {
        const name = isRecord(tag) ? text(tag["tag"]) : undefined;
        return name ? [name] : [];
      })
    : [];
  if (tags.length) {
    citation["keyword"] = tags.join(", ");
  }
  return sanitizedCitation(citation);
}

const itemTypes: Readonly<Record<string, string>> = {
  artwork: "graphic",
  audioRecording: "song",
  bill: "bill",
  blogPost: "post-weblog",
  book: "book",
  bookSection: "chapter",
  case: "legal_case",
  computerProgram: "software",
  conferencePaper: "paper-conference",
  dataset: "dataset",
  dictionaryEntry: "entry-dictionary",
  document: "document",
  email: "personal_communication",
  encyclopediaArticle: "entry-encyclopedia",
  film: "motion_picture",
  forumPost: "post",
  hearing: "hearing",
  instantMessage: "personal_communication",
  interview: "interview",
  journalArticle: "article-journal",
  letter: "personal_communication",
  magazineArticle: "article-magazine",
  manuscript: "manuscript",
  map: "map",
  newspaperArticle: "article-newspaper",
  patent: "patent",
  podcast: "song",
  preprint: "article",
  presentation: "speech",
  radioBroadcast: "broadcast",
  report: "report",
  standard: "standard",
  statute: "legislation",
  thesis: "thesis",
  tvBroadcast: "broadcast",
  videoRecording: "motion_picture",
  webpage: "webpage",
};

/** Zotero's item-specific field names map to the CSL variable of their base field. */
const fieldMap: Readonly<Record<string, string>> = {
  title: "title",
  shortTitle: "title-short",
  abstractNote: "abstract",
  publicationTitle: "container-title",
  bookTitle: "container-title",
  proceedingsTitle: "container-title",
  encyclopediaTitle: "container-title",
  dictionaryTitle: "container-title",
  websiteTitle: "container-title",
  blogTitle: "container-title",
  forumTitle: "container-title",
  programTitle: "container-title",
  journalAbbreviation: "container-title-short",
  series: "collection-title",
  seriesTitle: "collection-title",
  seriesNumber: "collection-number",
  volume: "volume",
  issue: "issue",
  pages: "page",
  numPages: "number-of-pages",
  numberOfVolumes: "number-of-volumes",
  edition: "edition",
  section: "section",
  publisher: "publisher",
  university: "publisher",
  institution: "publisher",
  company: "publisher",
  label: "publisher",
  network: "publisher",
  studio: "publisher",
  distributor: "publisher",
  repository: "publisher",
  place: "publisher-place",
  number: "number",
  reportNumber: "number",
  billNumber: "number",
  patentNumber: "number",
  episodeNumber: "number",
  genre: "genre",
  thesisType: "genre",
  reportType: "genre",
  websiteType: "genre",
  postType: "genre",
  presentationType: "genre",
  manuscriptType: "genre",
  letterType: "genre",
  conferenceName: "event-title",
  meetingName: "event-title",
  medium: "medium",
  artworkMedium: "medium",
  audioRecordingFormat: "medium",
  videoRecordingFormat: "medium",
  runningTime: "dimensions",
  versionNumber: "version",
  language: "language",
  DOI: "DOI",
  ISBN: "ISBN",
  ISSN: "ISSN",
  url: "URL",
  archive: "archive",
  archiveLocation: "archive_location",
  callNumber: "call-number",
  libraryCatalog: "source",
};

const creatorRoles: Readonly<Record<string, string>> = {
  author: "author",
  editor: "editor",
  translator: "translator",
  contributor: "contributor",
  seriesEditor: "collection-editor",
  bookAuthor: "container-author",
  reviewedAuthor: "reviewed-author",
  director: "director",
  composer: "composer",
  interviewer: "interviewer",
  recipient: "recipient",
  illustrator: "illustrator",
  producer: "producer",
  performer: "performer",
  castMember: "performer",
  programmer: "author",
  artist: "author",
  presenter: "author",
  podcaster: "author",
  sponsor: "author",
  inventor: "author",
  cartographer: "author",
  interviewee: "author",
};

function creators(value: unknown): Record<string, CslName[]> {
  const byRole: Record<string, CslName[]> = {};
  for (const creator of Array.isArray(value) ? value : []) {
    if (!isRecord(creator)) {
      continue;
    }
    const role = creatorRoles[text(creator["creatorType"]) ?? "author"];
    const family = text(creator["lastName"]);
    const given = text(creator["firstName"]);
    const literal = text(creator["name"]);
    const name: CslName | undefined = family
      ? { family, ...(given ? { given } : {}) }
      : literal
        ? { literal }
        : undefined;
    if (role && name) {
      byRole[role] = [...(byRole[role] ?? []), name];
    }
  }
  return byRole;
}

/** Zotero keeps identifiers it has no field for as `Key: value` lines in Extra. */
function extraIdentifiers(extra: string | undefined): Record<string, string> {
  const found: Record<string, string> = {};
  for (const line of extra?.split("\n") ?? []) {
    const match = /^\s*(PMID|PMCID):\s*(\S+)\s*$/iu.exec(line);
    if (match?.[1] && match[2]) {
      found[match[1].toUpperCase()] = match[2];
    }
  }
  return found;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
