import {
  citationCompletenessWarnings,
  citekeyForCitation,
  type CitationCandidate,
  type Source,
} from "@mdbase-reader/core";
import { useCallback, useState } from "react";

import {
  assessCitationDraft,
  citationDraftForSource,
  storedCitationDraftForSource,
} from "./citation-editor-model.js";
import { mergeCitation, resolutionRequest, serializeCitation } from "./citation-form-model.js";
import { readerErrorMessage } from "./errors.js";

import type { SelectedValue } from "./selected-resource.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

export interface CitationEditorController {
  readonly draft: string;
  readonly assessment: ReturnType<typeof assessCitationDraft>;
  readonly status: "idle" | "saving" | "saved";
  readonly error: string | null;
  readonly dirty: boolean;
  readonly suggested: boolean;
  readonly warnings: readonly string[];
  readonly resolutionAvailable: boolean;
  readonly resolutionStatus: "idle" | "resolving" | "resolved";
  readonly resolutionError: string | null;
  readonly candidate: CitationCandidate | null;
  readonly setDraft: (value: string) => void;
  readonly setCitation: (value: Readonly<Record<string, unknown>>) => void;
  readonly save: () => void;
  readonly resolve: (query: string) => void;
  readonly applyCandidate: (fields: ReadonlySet<string>) => void;
  readonly dismissCandidate: () => void;
  readonly regenerateCitekey: () => void;
}

// The hook intentionally owns one source-scoped editing transaction.
// eslint-disable-next-line complexity, max-lines-per-function
export function useCitationEditor(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly source: Source | null;
  readonly onSaved: (source: Source) => void;
}): CitationEditorController {
  const [draftState, setDraftState] = useState<SelectedValue<string> | null>(null);
  const [statusState, setStatusState] = useState<SelectedValue<
    CitationEditorController["status"]
  > | null>(null);
  const [errorState, setErrorState] = useState<SelectedValue<string | null> | null>(null);
  const [candidateState, setCandidateState] =
    useState<SelectedValue<CitationCandidate | null> | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<"idle" | "resolving" | "resolved">(
    "idle",
  );
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const sourceId = input.source?.id ?? null;
  const draft =
    sourceId && draftState?.sourceId === sourceId
      ? draftState.value
      : input.source
        ? citationDraftForSource(input.source)
        : "";
  const status = sourceId && statusState?.sourceId === sourceId ? statusState.value : "idle";
  const error = sourceId && errorState?.sourceId === sourceId ? errorState.value : null;
  const storedDraft = storedDraftFor(input.source);
  const suggested = hasSuggestedDraft(input.source, storedDraft);
  const dirty = isCitationDirty(input.source, storedDraft, draft);
  const assessment = assessCitationDraft(draft);
  const setDraft = useCallback(
    (value: string): void => {
      if (sourceId) {
        setDraftState({ sourceId, value });
        setStatusState({ sourceId, value: "idle" });
        setErrorState({ sourceId, value: null });
      }
    },
    [sourceId],
  );
  const setCitation = useCallback(
    (value: Readonly<Record<string, unknown>>): void => {
      setDraft(serializeCitation(value));
    },
    [setDraft],
  );
  const save = useCallback((): void => {
    const source = input.source;
    if (!source || !assessment.valid || !dirty || status === "saving") {
      return;
    }
    setStatusState({ sourceId: source.id, value: "saving" });
    setErrorState({ sourceId: source.id, value: null });
    void input.gateway
      .saveSourceCitation(source, assessment.value)
      .then((updated) => {
        input.onSaved(updated);
        setStatusState({ sourceId: updated.id, value: "saved" });
      })
      .catch((reason: unknown) => {
        setStatusState({ sourceId: source.id, value: "idle" });
        setErrorState({
          sourceId: source.id,
          value: readerErrorMessage(reason, "Reader could not save this citation."),
        });
      });
  }, [assessment, dirty, input, status]);

  const resolve = useCallback(
    (query: string): void => {
      if (
        !sourceId ||
        !input.gateway.resolveCitation ||
        !query.trim() ||
        resolutionStatus === "resolving"
      ) {
        return;
      }
      setResolutionStatus("resolving");
      setResolutionError(null);
      void input.gateway
        .resolveCitation(resolutionRequest(query))
        .then((candidate) => {
          setCandidateState({ sourceId, value: candidate });
          setResolutionStatus("resolved");
        })
        .catch((reason: unknown) => {
          setResolutionStatus("idle");
          setResolutionError(
            readerErrorMessage(reason, "Reader could not find citation metadata."),
          );
        });
    },
    [input.gateway, resolutionStatus, sourceId],
  );

  const candidate = sourceId && candidateState?.sourceId === sourceId ? candidateState.value : null;
  const dismissCandidate = useCallback((): void => {
    if (sourceId) {
      setCandidateState({ sourceId, value: null });
      setResolutionStatus("idle");
    }
  }, [sourceId]);
  const applyCandidate = useCallback(
    (fields: ReadonlySet<string>): void => {
      if (candidate && assessment.value) {
        setCitation(mergeCitation(assessment.value, candidate.citation, fields));
        dismissCandidate();
      }
    },
    [assessment.value, candidate, dismissCandidate, setCitation],
  );
  const regenerateCitekey = useCallback((): void => {
    const source = input.source;
    if (!source || !assessment.value) {
      return;
    }
    void input.gateway
      .library()
      .then(({ sources }) => {
        setCitation({
          ...assessment.value,
          id: citekeyForCitation(assessment.value ?? {}, sources, source.id),
        });
      })
      .catch((reason: unknown) => {
        setErrorState({
          sourceId: source.id,
          value: readerErrorMessage(reason, "Reader could not generate a citekey."),
        });
      });
  }, [assessment.value, input.gateway, input.source, setCitation]);

  const warnings = assessment.valid ? citationCompletenessWarnings(assessment.value) : [];

  return {
    draft,
    assessment,
    status,
    error,
    dirty,
    suggested,
    warnings,
    resolutionAvailable: input.gateway.resolveCitation !== undefined,
    resolutionStatus,
    resolutionError,
    candidate,
    setDraft,
    setCitation,
    save,
    resolve,
    applyCandidate,
    dismissCandidate,
    regenerateCitekey,
  };
}

function storedDraftFor(source: Source | null): string | null {
  return source ? storedCitationDraftForSource(source) : null;
}

function hasSuggestedDraft(source: Source | null, storedDraft: string | null): boolean {
  return source !== null && storedDraft === null;
}

function isCitationDirty(
  source: Source | null,
  storedDraft: string | null,
  draft: string,
): boolean {
  return source !== null && (storedDraft === null || draft !== storedDraft);
}
