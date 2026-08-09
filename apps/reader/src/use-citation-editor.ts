import { useCallback, useState } from "react";

import { assessCitationDraft, citationDraftForSource } from "./citation-editor-model.js";
import { readerErrorMessage } from "./errors.js";

import type { SelectedValue } from "./selected-resource.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source } from "@mdbase-reader/core";

export interface CitationEditorController {
  readonly draft: string;
  readonly assessment: ReturnType<typeof assessCitationDraft>;
  readonly status: "idle" | "saving" | "saved";
  readonly error: string | null;
  readonly dirty: boolean;
  readonly setDraft: (value: string) => void;
  readonly save: () => void;
}

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
  const sourceId = input.source?.id ?? null;
  const draft =
    sourceId && draftState?.sourceId === sourceId
      ? draftState.value
      : input.source
        ? citationDraftForSource(input.source)
        : "";
  const status = sourceId && statusState?.sourceId === sourceId ? statusState.value : "idle";
  const error = sourceId && errorState?.sourceId === sourceId ? errorState.value : null;
  const dirty = input.source ? draft !== citationDraftForSource(input.source) : false;
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

  return { draft, assessment, status, error, dirty, setDraft, save };
}
