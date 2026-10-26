import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { validateCslItem } from "@mdbase-reader/core";
import { formatCitation } from "@mdbase-reader/ui/citation";
import { useEffect, useState, type JSX } from "react";

import { citationNames } from "./citation-form-model.js";

import type { ChapterOutline } from "./chapter-outline.js";
import type { DocumentRange, PlannedSourcePart } from "@mdbase-reader/core";

/** Show the reviewed work, not persistence details or the shared file's identity. */
export function ChapterPreview({
  plan,
  outline,
}: {
  readonly plan: PlannedSourcePart;
  readonly outline: ChapterOutline;
}): JSX.Element {
  useLocale();
  const [citation, setCitation] = useState(translate({ message: "Preparing citation…" }));
  useEffect(() => {
    let current = true;
    const validated = validateCslItem(plan.citation);
    const formatted = validated.valid
      ? formatCitation(validated.item, "apa", "en-US")
      : Promise.resolve(
          translate({
            message: "Add a chapter title and check the citation details to preview it.",
          }),
        );
    void formatted.then((formatted) => {
      if (current) {
        setCitation(formatted);
      }
    });
    return () => {
      current = false;
    };
  }, [plan.citation]);
  const authors = citationNames(plan.citation, "author")
    .map(
      (name) =>
        name.literal ??
        [
          name.given,
          name["dropping-particle"],
          name["non-dropping-particle"],
          name.family,
          name.suffix,
        ]
          .filter(Boolean)
          .join(" "),
    )
    .filter(Boolean)
    .join("; ");
  const range = plan.document?.range;
  const printedPage = plan.citation["page"];
  const printed =
    (typeof printedPage === "string" ? printedPage : undefined) ??
    (range?.kind === "pages"
      ? [range.labels?.start, range.labels?.end].filter(Boolean).join("–")
      : undefined);
  return (
    <section
      className="chapter-preview"
      aria-label={plan.title || translate({ message: "Untitled chapter" })}
    >
      <h3>{plan.title || translate({ message: "Untitled chapter" })}</h3>
      <dl>
        <dt>
          <Trans>Book</Trans>
        </dt>
        <dd>{plan.parent.title}</dd>
        <dt>
          {outline.pageCount !== undefined
            ? translate({ message: "PDF pages" })
            : translate({ message: "Sections" })}
        </dt>
        <dd>{chapterLocation(range, outline)}</dd>
        {printed ? (
          <>
            <dt>
              <Trans>Printed pages</Trans>
            </dt>
            <dd>{printed}</dd>
          </>
        ) : null}
        <dt>
          <Trans>Authors</Trans>
        </dt>
        <dd>{authors || translate({ message: "Not added" })}</dd>
      </dl>
      <p className="chapter-preview-citation">
        <strong>
          <Trans>Citation (APA)</Trans>
        </strong>
        <br />
        {citation}
      </p>
    </section>
  );
}

function chapterLocation(range: DocumentRange | undefined, outline: ChapterOutline): string {
  if (
    range?.kind === "pages" &&
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end)
  ) {
    if (range.start >= 0 && range.end >= range.start && range.end < (outline.pageCount ?? 0)) {
      return translate`${String(range.start + 1)}–${String(range.end + 1)} of ${String(outline.pageCount)} pages`;
    }
  }
  if (range?.kind === "epub-spine" && outline.spine) {
    const start = outline.spine.indexOf(range.start);
    const end = outline.spine.indexOf(range.end);
    if (start >= 0 && end >= start) {
      return translate`${String(start + 1)}–${String(end + 1)} of ${String(outline.spine.length)} sections (included in full)`;
    }
  }
  return translate({ message: "Choose a valid start and end to preview the chapter’s location." });
}
