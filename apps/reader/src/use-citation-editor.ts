import { signalMdbaseMark } from "@mdbase-dev/ui/mark-activity";
import {
  CitationChangedElsewhereError,
  citationCompletenessWarnings,
  citekeyForCitation,
  cslValuesEqual,
  parseCslProvenance,
  type CslProvenance,
  type Source,
} from "@mdbase-reader/core";
import {
  claimSourceLabel,
  type CitationSuggestion,
} from "@mdbase-reader/web-capture/citation-updates";
import { useCallback, useState } from "react";

import { assessCitationDraft, citationDraftForSource } from "./citation-editor-model.js";
import { serializeCitation } from "./citation-form-model.js";
import { editedCitationProvenance } from "./citation-provenance.js";
import { readerErrorMessage } from "./errors.js";
import { useCitationLookup } from "./use-citation-lookup.js";

import type { SelectedValue } from "./selected-resource.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

interface DraftState {
  readonly source: Source;
  readonly value: string;
  readonly provenance: CslProvenance;
  readonly lastCitation: Readonly<Record<string, unknown>>;
}

export interface CitationEditorController extends ReturnType<typeof useCitationLookup> {
  readonly draft: string;
  readonly provenance: CslProvenance;
  readonly assessment: ReturnType<typeof assessCitationDraft>;
  readonly status: "idle" | "saving" | "saved";
  readonly error: string | null;
  readonly conflict: Pick<
    CitationChangedElsewhereError,
    "currentCitation" | "currentProvenance"
  > | null;
  readonly dirty: boolean;
  readonly suggested: boolean;
  readonly warnings: readonly string[];
  readonly setDraft: (value: string) => void;
  readonly setCitation: (value: Readonly<Record<string, unknown>>) => void;
  readonly save: () => void;
  readonly useTheirVersion: () => void;
  readonly keepMine: () => void;
  readonly regenerateCitekey: () => void;
}

// One source-scoped transaction pins the baseline even when unrelated writes refresh the source.
// eslint-disable-next-line complexity, max-lines-per-function
export function useCitationEditor(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly source: Source | null;
  readonly onSaved: (source: Source) => void;
}): CitationEditorController {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [statusState, setStatusState] = useState<SelectedValue<
    CitationEditorController["status"]
  > | null>(null);
  const [errorState, setErrorState] = useState<SelectedValue<string | null> | null>(null);
  const [conflictState, setConflictState] = useState<SelectedValue<
    NonNullable<CitationEditorController["conflict"]>
  > | null>(null);
  const sourceId = input.source?.id;
  const transaction = draftState?.source.id === sourceId ? draftState : null;
  const source = transaction?.source ?? input.source;
  const draft = transaction?.value ?? (source ? citationDraftForSource(source) : "");
  const provenance = transaction?.provenance ?? provenanceFor(source);
  const status = statusState?.sourceId === sourceId ? (statusState?.value ?? "idle") : "idle";
  const error = errorState?.sourceId === sourceId ? (errorState?.value ?? null) : null;
  const conflict = conflictState?.sourceId === sourceId ? (conflictState?.value ?? null) : null;
  const assessment = assessCitationDraft(draft);
  const dirty = Boolean(
    source &&
    (!cslValuesEqual(assessment.value, source.frontmatter["csl"]) ||
      !cslValuesEqual(provenance, provenanceFor(source))),
  );

  const updateDraft = useCallback(
    (value: string, accepted: readonly CitationSuggestion[] = []): void => {
      if (!source) {
        return;
      }
      setDraftState((previous) => {
        const current =
          previous?.source.id === source.id
            ? previous
            : { source, value: draft, provenance, lastCitation: assessment.value ?? {} };
        const next = assessCitationDraft(value).value;
        const updated = next
          ? {
              ...editedCitationProvenance(current.lastCitation, next, current.provenance),
            }
          : { ...current.provenance };
        for (const suggestion of accepted) {
          updated[suggestion.field] = {
            value: suggestion.proposed,
            source: claimSourceLabel(suggestion.source),
            ...(suggestion.evidence ? { agreed: [suggestion.evidence] } : {}),
          };
        }
        return {
          ...current,
          value,
          provenance: updated,
          lastCitation: next ?? current.lastCitation,
        };
      });
      setStatusState({ sourceId: source.id, value: "idle" });
      setErrorState({ sourceId: source.id, value: null });
    },
    [assessment.value, draft, provenance, source],
  );
  const setDraft = useCallback((value: string): void => updateDraft(value), [updateDraft]);
  const setCitation = useCallback(
    (value: Readonly<Record<string, unknown>>): void => setDraft(serializeCitation(value)),
    [setDraft],
  );
  const lookup = useCitationLookup({
    gateway: input.gateway,
    source,
    citation: assessment.value ?? null,
    provenance,
    onAccept: (suggestions) => {
      if (!assessment.value || suggestions.length === 0) {
        return;
      }
      updateDraft(
        serializeCitation({
          ...assessment.value,
          ...Object.fromEntries(suggestions.map(({ field, proposed }) => [field, proposed])),
        }),
        suggestions,
      );
    },
  });

  const persist = useCallback(
    (expectedCitation: unknown): void => {
      if (!source || !assessment.valid || !dirty || status === "saving") {
        return;
      }
      const savedDraft = draft;
      setDraftState((previous) =>
        previous?.source.id === source.id
          ? previous
          : { source, value: draft, provenance, lastCitation: assessment.value },
      );
      setStatusState({ sourceId: source.id, value: "saving" });
      setErrorState({ sourceId: source.id, value: null });
      void input.gateway
        .saveSourceCitation(source, assessment.value, { provenance, expectedCitation })
        .then((updated) => {
          input.onSaved(updated);
          setDraftState((previous) =>
            previous?.source.id === updated.id
              ? {
                  ...previous,
                  source: updated,
                  ...(previous.value === savedDraft ? { provenance: provenanceFor(updated) } : {}),
                }
              : previous,
          );
          setConflictState(null);
          setStatusState({ sourceId: updated.id, value: "saved" });
          signalMdbaseMark("saved");
        })
        .catch((reason: unknown) => {
          signalMdbaseMark("error");
          setStatusState({ sourceId: source.id, value: "idle" });
          if (reason instanceof CitationChangedElsewhereError) {
            setConflictState({
              sourceId: source.id,
              value: {
                currentCitation: reason.currentCitation,
                currentProvenance: reason.currentProvenance,
              },
            });
          } else {
            setErrorState({
              sourceId: source.id,
              value: readerErrorMessage(reason, "Reader could not save this citation."),
            });
          }
        });
    },
    [assessment, dirty, draft, input, provenance, source, status],
  );
  const save = (): void => {
    if (!conflict) {
      persist(source?.frontmatter["csl"]);
    }
  };
  const useTheirVersion = (): void => {
    if (!source || !conflict) {
      return;
    }
    const value = JSON.stringify(conflict.currentCitation ?? {}, null, 2);
    const theirs = assessCitationDraft(value);
    const theirSource = {
      ...source,
      cslProvenance: conflict.currentProvenance,
      frontmatter: {
        ...source.frontmatter,
        csl: conflict.currentCitation,
        "csl-provenance": conflict.currentProvenance,
      },
    };
    Reflect.deleteProperty(theirSource, "citation");
    if (theirs.valid) {
      theirSource.citation = theirs.value;
    }
    setDraftState({
      source: theirSource,
      value,
      lastCitation: theirs.value ?? {},
      provenance: conflict.currentProvenance,
    });
    lookup.resetLookup();
    setConflictState(null);
    setErrorState(null);
    setStatusState(null);
  };
  const regenerateCitekey = (): void => {
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
      .catch((reason: unknown) =>
        setErrorState({
          sourceId: source.id,
          value: readerErrorMessage(reason, "Reader could not generate a citekey."),
        }),
      );
  };

  return {
    ...lookup,
    draft,
    provenance,
    assessment,
    status,
    error,
    conflict,
    dirty,
    suggested: source !== null && source.frontmatter["csl"] === undefined,
    warnings: assessment.valid ? citationCompletenessWarnings(assessment.value) : [],
    setDraft,
    setCitation,
    save,
    useTheirVersion,
    keepMine: () => conflict && persist(conflict.currentCitation),
    regenerateCitekey,
  };
}

function provenanceFor(source: Source | null): CslProvenance {
  return source?.cslProvenance ?? parseCslProvenance(source?.frontmatter["csl-provenance"]);
}
