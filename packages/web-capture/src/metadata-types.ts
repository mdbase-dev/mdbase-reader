export const scholarlyJsonLdTypes = new Set([
  "ScholarlyArticle",
  "MedicalScholarlyArticle",
  "Book",
  "Chapter",
  "Thesis",
  "Report",
  "Dataset",
]);

/** schema.org article types and the CSL type each becomes. */
export const articleJsonLdTypes = new Map([
  ["NewsArticle", "article-newspaper"],
  ["AnalysisNewsArticle", "article-newspaper"],
  ["BackgroundNewsArticle", "article-newspaper"],
  ["OpinionNewsArticle", "article-newspaper"],
  ["ReportageNewsArticle", "article-newspaper"],
  ["ReviewNewsArticle", "article-newspaper"],
  ["BlogPosting", "post-weblog"],
  ["LiveBlogPosting", "post-weblog"],
  ["SocialMediaPosting", "post"],
  ["DiscussionForumPosting", "post"],
  ["Article", "webpage"],
  ["TechArticle", "webpage"],
  ["AdvertiserContentArticle", "webpage"],
  ["SatiricalArticle", "webpage"],
]);

export const embeddedTypes: readonly (readonly [string, string])[] = [
  ["citation_dissertation_institution", "thesis"],
  ["citation_technical_report_institution", "report"],
  ["citation_conference_title", "paper-conference"],
  ["citation_inbook_title", "chapter"],
  ["citation_book_title", "chapter"],
  ["citation_journal_title", "article-journal"],
  ["prism.publicationname", "article-journal"],
  ["citation_isbn", "book"],
];
