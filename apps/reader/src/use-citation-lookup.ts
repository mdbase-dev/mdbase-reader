import { cslValuesEqual, type CslProvenance, type Source } from "@mdbase-reader/core";
import {
  resolveCitation,
  type Claim,
  type CitationSuggestion,
} from "@mdbase-reader/web-capture/citation-updates";
import { useEffect, useRef, useState } from "react";

import { archivedCitationClaims, citationArchive } from "./archived-citation-claims.js";
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
  readonly onDismiss: (suggestion: CitationSuggestion) => void;
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
  const scope = JSON.stringify([input.source?.collectionId, sourceId]);
  useEffect(() => () => pending.current?.abort(), [scope]);
  const current = state?.scope === scope ? state : null;
  if (state && !current) {
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
      previous?.scope === scope
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
    resolutionAvailable: lookupAvailable(input.gateway, input.source),
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
    dismissSuggestion: (field) => {
      const suggestion = suggestions.find((item) => item.field === field);
      if (suggestion) {
        input.onDismiss(suggestion);
      }
    },
    resetLookup: () => {
      pending.current?.abort();
      setState(null);
    },
  };
}

function lookupAvailable(gateway: ReaderWorkspaceGateway, source: Source | null): boolean {
  return (
    gateway.citationClaims !== undefined ||
    gateway.resolveCitation !== undefined ||
    citationArchive(source) !== undefined
  );
}

async function lookupClaims(
  gateway: ReaderWorkspaceGateway,
  query: string,
  source: Source | null,
  citation: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<readonly Claim[]> {
  const url = source?.url ?? (typeof citation["URL"] === "string" ? citation["URL"] : undefined);
  const [archive, remote] = await Promise.allSettled([
    archivedCitationClaims(gateway, source, url, signal),
    remoteLookupClaims(gateway, query, source, citation, signal),
  ]);
  signal.throwIfAborted();
  const claims = archive.status === "fulfilled" ? archive.value : [];
  if (remote.status === "rejected" && claims.length === 0) {
    throw remote.reason;
  }
  return [...claims, ...(remote.status === "fulfilled" ? remote.value : [])];
}

async function remoteLookupClaims(
  gateway: ReaderWorkspaceGateway,
  query: string,
  source: Source | null,
  citation: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<readonly Claim[]> {
  const trimmed = query.trim();
  const refresh = trimmed === "" || trimmed.toLowerCase() === "refresh";
  const request = resolutionRequest(trimmed);
  const doi = typeof citation["DOI"] === "string" ? citation["DOI"] : undefined;
  const url = source?.url ?? (typeof citation["URL"] === "string" ? citation["URL"] : undefined);
  if (
    gateway.citationClaims &&
    (refresh || request.kind === "url" || /^(?:doi:\s*)?10\.\d{4,9}\//iu.test(trimmed))
  ) {
    return gateway.citationClaims(
      refresh
        ? { query: "", ...(url ? { url } : {}), ...(doi ? { doi } : {}) }
        : { query: trimmed },
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
