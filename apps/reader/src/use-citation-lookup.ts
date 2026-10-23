import { cslValuesEqual, type CslProvenance, type Source } from "@mdbase-reader/core";
import {
  resolveCitation,
  type Claim,
  type CitationSuggestion,
} from "@mdbase-reader/web-capture/citation-updates";
import { useEffect, useRef, useState } from "react";

import { resolutionRequest } from "./citation-form-model.js";
import { readerErrorMessage } from "./errors.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

interface LookupState {
  readonly scope: string;
  readonly status: "idle" | "resolving" | "resolved";
  readonly error: string | null;
  readonly claims: readonly Claim[];
  readonly dismissed: ReadonlySet<string>;
}

export function useCitationLookup(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly source: Source | null;
  readonly citation: Readonly<Record<string, unknown>> | null;
  readonly provenance: CslProvenance;
  readonly onAccept: (suggestions: readonly CitationSuggestion[]) => void;
}): {
  readonly resolutionAvailable: boolean;
  readonly resolutionStatus: LookupState["status"];
  readonly resolutionError: string | null;
  readonly suggestions: readonly CitationSuggestion[];
  readonly resolve: (query: string) => void;
  readonly acceptSuggestions: (fields: ReadonlySet<string>) => void;
  readonly dismissSuggestion: (field: string) => void;
  readonly resetLookup: () => void;
} {
  const [state, setState] = useState<LookupState | null>(null);
  const pending = useRef<AbortController | null>(null);
  const sourceId = input.source?.id;
  const scope = JSON.stringify([sourceId, input.citation, input.provenance]);
  useEffect(() => () => pending.current?.abort(), [scope]);
  const current = state?.scope === scope ? state : null;
  if (state?.scope !== undefined && !current) {
    setState(null);
  }
  const suggestions = input.citation
    ? resolveCitation({
        claims: current?.claims ?? [],
        existing: { citation: input.citation, provenance: input.provenance },
      }).suggestions.filter(({ field }) => field !== "id" && !current?.dismissed.has(field))
    : [];
  const dismissFields = (fields: ReadonlySet<string>): void => {
    setState((previous) =>
      previous && previous.scope === scope
        ? { ...previous, dismissed: new Set([...previous.dismissed, ...fields]) }
        : previous,
    );
  };
  const resolve = (query: string): void => {
    if (!sourceId || !input.citation) {
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ scope, status: "resolving", error: null, claims: [], dismissed: new Set() });
    void lookupClaims(input.gateway, query, input.source, input.citation, controller.signal)
      .then((claims) => {
        if (!controller.signal.aborted) {
          setState({ scope, status: "resolved", error: null, claims, dismissed: new Set() });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            scope,
            status: "idle",
            error: readerErrorMessage(reason, "Reader could not find citation metadata."),
            claims: [],
            dismissed: new Set(),
          });
        }
      });
  };
  return {
    resolutionAvailable:
      input.gateway.citationClaims !== undefined || input.gateway.resolveCitation !== undefined,
    resolutionStatus: current?.status ?? "idle",
    resolutionError: current?.error ?? null,
    suggestions,
    resolve,
    acceptSuggestions: (fields) => {
      const selected = suggestions.filter(
        (suggestion) =>
          fields.has(suggestion.field) &&
          cslValuesEqual(input.citation?.[suggestion.field], suggestion.current),
      );
      input.onAccept(selected);
      dismissFields(new Set(selected.map(({ field }) => field)));
    },
    dismissSuggestion: (field) => dismissFields(new Set([field])),
    resetLookup: () => {
      pending.current?.abort();
      setState(null);
    },
  };
}

async function lookupClaims(
  gateway: ReaderWorkspaceGateway,
  query: string,
  source: Source | null,
  citation: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<readonly Claim[]> {
  const request = resolutionRequest(query);
  const doi = typeof citation["DOI"] === "string" ? citation["DOI"] : undefined;
  const url = source?.url ?? (typeof citation["URL"] === "string" ? citation["URL"] : undefined);
  if (
    gateway.citationClaims &&
    (request.kind === "url" ||
      /^10\.|^doi:/iu.test(query) ||
      (query === citation["title"] && Boolean(doi ?? url)))
  ) {
    return gateway.citationClaims(
      { query, ...(url ? { url } : {}), ...(doi ? { doi } : {}) },
      { signal },
    );
  }
  const candidate = await gateway.resolveCitation?.(request, { signal });
  return candidate
    ? Object.entries(candidate.citation).map(([field, value]) => ({
        field,
        value,
        source: { kind: "generic-remote", name: candidate.provenance.provider },
        observedAt: candidate.provenance.retrievedAt,
      }))
    : [];
}
