import type { ExtensionCaptureController } from "./capture-controller.js";
import type { CitationDraft } from "@mdbase-reader/web-capture";

/**
 * Shows the citation that will be stored with a new source, and where it came from, in
 * enough detail to tell whether the page was matched to the right work.
 */
export function CitationCard({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (c.source) {
    return null;
  }
  if (c.citationPending) {
    return <p className="hint citation">Looking for citation details…</p>;
  }
  const preview = c.citation;
  if (!preview) {
    return null;
  }
  return (
    <section className="citation" aria-label="Citation">
      <span className="eyebrow">CITATION</span>
      <CitationDetails citation={preview.citation} doi={preview.doi ?? null} />
      <p className="hint">
        {preview.origin === "doi"
          ? "From the DOI registry. Saved with the source; edit it later in Reader."
          : "From the publisher’s page metadata. Saved with the source; edit it later in Reader."}
        {preview.problem ? ` The DOI record was unavailable (${preview.problem}).` : ""}
      </p>
    </section>
  );
}

/** Title, people, year, where it appeared, and its type and DOI: one work at a glance. */
export function CitationDetails({
  citation,
  doi,
  citekey,
}: {
  readonly citation: CitationDraft;
  readonly doi: string | null;
  /** Once stored, the key it is cited by. */
  readonly citekey?: string;
}): React.JSX.Element {
  const title = text(citation["title"]);
  const people = authors(citation["author"]);
  const year = issuedYear(citation["issued"]);
  const venue = text(citation["container-title"]) ?? text(citation["publisher"]);
  const type = text(citation.type);
  return (
    <>
      {title ? <p className="citation-title">{title}</p> : null}
      {people ? <p>{people}</p> : null}
      {year || venue ? <p>{[venue, year].filter(Boolean).join(", ")}</p> : null}
      <CitationFields type={type} doi={doi} citekey={citekey ?? null} />
      {title || people || year || venue ? null : <p>Citation details found.</p>}
    </>
  );
}

/** The identifiers: its citekey once stored, its CSL type and its DOI. */
function CitationFields({
  type,
  doi,
  citekey,
}: {
  readonly type: string | null;
  readonly doi: string | null;
  readonly citekey: string | null;
}): React.JSX.Element | null {
  if (!type && !doi && !citekey) {
    return null;
  }
  return (
    <dl className="citation-fields">
      {citekey ? (
        <div>
          <dt>Citekey</dt>
          <dd>
            <code>{citekey}</code>
          </dd>
        </div>
      ) : null}
      {type ? (
        <div>
          <dt>Type</dt>
          <dd>{type.replaceAll("-", " ")}</dd>
        </div>
      ) : null}
      {doi ? (
        <div>
          <dt>DOI</dt>
          <dd>
            <code>{doi}</code>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Up to three names in full, then “et al.”. */
function authors(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const names = (value as { given?: unknown; family?: unknown; literal?: unknown }[])
    .map((person) =>
      typeof person.literal === "string"
        ? person.literal
        : [person.given, person.family].filter((part) => typeof part === "string").join(" "),
    )
    .filter(Boolean);
  if (!names.length) {
    return null;
  }
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
}

function issuedYear(value: unknown): string | null {
  const year = (value as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0]?.[0];
  return typeof year === "number" || typeof year === "string" ? String(year) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
