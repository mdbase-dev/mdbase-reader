import { signalMdbaseMark } from "@mdbase-dev/ui/mark-activity";
import {
  CitationChangedElsewhereError,
  citationCompletenessWarnings,
  citekeyForCitation,
  cslValuesEqual,
  loadedCitation,
  maxRejectedCslValues,
  parseCslProvenance,
  preserveCslDismissals,
  type CslProvenance,
  type Source,
} from "@mdbase-reader/core";
import {
  claimSourceLabel,
  claimValuesMatch,
  type CitationSuggestion,
} from "@mdbase-reader/web-capture/citation-updates";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { assessCitationDraft, citationDraftForSource } from "./citation-editor-model.js";
import { serializeCitation } from "./citation-form-model.js";
import { editedCitationProvenance } from "./citation-provenance.js";
import { readerErrorMessage } from "./errors.js";
import { useCitationLookup } from "./use-citation-lookup.js";

import type { SelectedValue } from "./selected-resource.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

interface DraftState {
  readonly source: Source;
  readonly parentSource: Source | null;
  readonly expectedCitation: unknown;
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
  const pendingSaves = useRef(new Set<string>());
  const [statusState, setStatusState] = useState<SelectedValue<
    CitationEditorController["status"]
  > | null>(null);
  const [errorState, setErrorState] = useState<SelectedValue<string | null> | null>(null);
  const [conflictState, setConflictState] = useState<SelectedValue<
    NonNullable<CitationEditorController["conflict"]>
  > | null>(null);
  // Revisions are opaque: remember those already seen rather than ordering them. In particular,
  // a parent still rendering the pre-save revision must not undo a successful local save.
  const [active, setActive] = useState(() => selectionFor(input.source));
  const selection = useRef(active);
  useLayoutEffect(() => {
    selection.current = active;
  }, [active]);
  if (active.key !== sourceKey(input.source)) {
    setActive(selectionFor(input.source));
    setDraftState(null);
    setStatusState(null);
    setErrorState(null);
    setConflictState(null);
  } else if (!active.revisions.has(input.source?.recordRevision)) {
    setActive({
      ...active,
      latest: input.source,
      revisions: new Set([...active.revisions, input.source?.recordRevision]),
    });
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const sourceId = input.source?.id;
  const transaction = draftState?.source.id === sourceId ? draftState : null;
  const source = transaction?.source ?? active.latest;
  const draft = transaction?.value ?? (source ? citationDraftForSource(source) : "");
  const assessment = assessCitationDraft(draft);
  const provenance =
    transaction?.provenance ??
    (source?.frontmatter["csl"] === undefined && assessment.value
      ? editedCitationProvenance({}, assessment.value, provenanceFor(source))
      : provenanceFor(source));
  const status = statusState?.sourceId === sourceId ? (statusState?.value ?? "idle") : "idle";
  const error = errorState?.sourceId === sourceId ? (errorState?.value ?? null) : null;
  const conflict = conflictState?.sourceId === sourceId ? (conflictState?.value ?? null) : null;
  const dirty = Boolean(
    source &&
    (!cslValuesEqual(assessment.value, source.frontmatter["csl"]) ||
      !cslValuesEqual(provenance, provenanceFor(source))),
  );

  if (
    transaction &&
    !dirty &&
    status !== "saving" &&
    !conflict &&
    transaction.parentSource !== active.latest
  ) {
    setDraftState(null);
  }

  const updateDraft = useCallback(
    (
      value: string,
      accepted: readonly CitationSuggestion[] = [],
      dismissed: readonly CitationSuggestion[] = [],
    ): void => {
      if (!source) {
        return;
      }
      setDraftState((previous) => {
        const current =
          previous?.source.id === source.id
            ? previous
            : {
                source,
                parentSource: active.latest,
                expectedCitation: loadedCitation(source),
                value: draft,
                provenance,
                lastCitation: assessment.value ?? {},
              };
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
        for (const suggestion of dismissed) {
          const entry =
            updated[suggestion.field] ??
            // Dismissing a fill pins nothing: an empty value stays open to other proposals.
            (!emptyCslValue(next?.[suggestion.field])
              ? { value: next?.[suggestion.field], source: "user" }
              : { rejected: [] });
          updated[suggestion.field] = {
            ...entry,
            rejected: [
              { value: suggestion.proposed, from: "user" },
              ...(entry.rejected ?? []).filter(
                ({ value }) => !claimValuesMatch(suggestion.field, value, suggestion.proposed),
              ),
            ].slice(0, maxRejectedCslValues),
          };
        }
        return {
          ...current,
          value,
          provenance: preserveCslDismissals(updated, current.provenance),
          lastCitation: next ?? current.lastCitation,
        };
      });
      setStatusState({ sourceId: source.id, value: "idle" });
      setErrorState({ sourceId: source.id, value: null });
    },
    [active, assessment.value, draft, provenance, source],
  );
  const lookup = useCitationLookup({
    gateway: input.gateway,
    source: active.latest ?? source,
    citation: assessment.value ?? null,
    provenance,
    onDismiss: (suggestion) => updateDraft(draft, [], [suggestion]),
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

  const setDraft = (value: string): void => {
    // Manual edits may change the work being looked up. Accepted fields, in contrast, use
    // updateDraft directly so the same review keeps its remaining claims and dismissals.
    lookup.resetLookup();
    updateDraft(value);
  };
  const setCitation = (value: Readonly<Record<string, unknown>>): void =>
    setDraft(serializeCitation(value));

  const persist = useCallback(
    (expectedCitation: unknown, replaceConflict = false): void => {
      if (
        !source ||
        !assessment.valid ||
        (!dirty && !replaceConflict) ||
        status === "saving" ||
        pendingSaves.current.has(source.id)
      ) {
        return;
      }
      pendingSaves.current.add(source.id);
      const savedDraft = draft;
      setDraftState((previous) =>
        previous?.source.id === source.id
          ? previous
          : {
              source,
              parentSource: active.latest,
              expectedCitation,
              value: draft,
              provenance,
              lastCitation: assessment.value,
            },
      );
      setStatusState({ sourceId: source.id, value: "saving" });
      setErrorState({ sourceId: source.id, value: null });
      void lookup
        .checkParentBeforeSave()
        .then(async (parentSaved) => {
          const updated = await input.gateway.saveSourceCitation(source, assessment.value, {
            provenance,
            expectedCitation,
          });
          parentSaved();
          return updated;
        })
        .then((updated) => {
          if (!mounted.current || selection.current.token !== active.token) {
            return;
          }
          const parentSource = selection.current.latest;
          setActive((previous) => ({
            ...previous,
            revisions: new Set([...previous.revisions, updated.recordRevision]),
          }));
          input.onSaved(updated);
          setDraftState((previous) =>
            previous?.source.id === updated.id
              ? {
                  ...previous,
                  source: updated,
                  parentSource,
                  expectedCitation: loadedCitation(updated),
                  ...(previous.value === savedDraft &&
                  cslValuesEqual(previous.provenance, provenance)
                    ? { provenance: provenanceFor(updated) }
                    : {}),
                }
              : previous,
          );
          setConflictState(null);
          setStatusState({ sourceId: updated.id, value: "saved" });
          signalMdbaseMark("saved");
        })
        .catch((reason: unknown) => {
          if (!mounted.current || selection.current.token !== active.token) {
            return;
          }
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
        })
        .finally(() => pendingSaves.current.delete(source.id));
    },
    [active, assessment, dirty, draft, input, provenance, source, status, lookup],
  );
  const save = (): void => {
    if (!conflict) {
      persist(transaction ? transaction.expectedCitation : source && loadedCitation(source));
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
      properties: { ...source.properties, csl: conflict.currentCitation },
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
      parentSource: active.latest,
      expectedCitation: conflict.currentCitation,
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
        if (!mounted.current || selection.current.token !== active.token) {
          return;
        }
        setCitation({
          ...assessment.value,
          id: citekeyForCitation(assessment.value ?? {}, sources, source.id),
        });
      })
      .catch((reason: unknown) => {
        if (mounted.current && selection.current.token === active.token) {
          setErrorState({
            sourceId: source.id,
            value: readerErrorMessage(reason, "Reader could not generate a citation key."),
          });
        }
      });
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
    keepMine: () => conflict && persist(conflict.currentCitation, true),
    regenerateCitekey,
  };
}

function selectionFor(source: Source | null): {
  readonly key: string;
  readonly token: symbol;
  readonly latest: Source | null;
  readonly revisions: ReadonlySet<Source["recordRevision"] | undefined>;
} {
  return {
    key: sourceKey(source),
    token: Symbol(),
    latest: source,
    revisions: new Set([source?.recordRevision]),
  };
}

function sourceKey(source: Source | null): string {
  return JSON.stringify([source?.collectionId, source?.id]);
}

function provenanceFor(source: Source | null): CslProvenance {
  return source?.cslProvenance ?? parseCslProvenance(source?.frontmatter["csl-provenance"]);
}

function emptyCslValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}
