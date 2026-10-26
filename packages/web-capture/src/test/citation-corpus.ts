import { existsSync, readFileSync, readdirSync } from "node:fs";
import { URL } from "node:url";

import type { CitationDraft } from "../csl-values.js";

/** Recorded HTTP response; error bodies intentionally need not be JSON objects. */
export interface CorpusResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface CorpusCase {
  readonly slug: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly html: string;
  readonly citoid?: CorpusResponse;
  readonly doi?: CorpusResponse;
  readonly expected: CitationDraft;
  readonly notes: readonly string[];
}

const moduleUrl = import.meta.url;
const root = new URL("../fixtures/citation-corpus/", moduleUrl);

/** Node-only test support: deliberately not exported from the browser package entry points. */
export function loadCitationCorpus(): CorpusCase[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name: slug }) => {
      const directory = new URL(`${slug}/`, root);
      const json = (name: string): unknown =>
        JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
      const response = (name: string): CorpusResponse | undefined =>
        existsSync(new URL(name, directory)) ? (json(name) as CorpusResponse) : undefined;
      const meta = json("meta.json") as Pick<CorpusCase, "url" | "retrievedAt" | "notes">;
      const citoid = response("citoid.json");
      const doi = response("doi.json");
      return {
        slug,
        ...meta,
        html: readFileSync(new URL("page.html", directory), "utf8"),
        ...(citoid ? { citoid } : {}),
        ...(doi ? { doi } : {}),
        expected: json("expected.json") as CitationDraft,
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}
