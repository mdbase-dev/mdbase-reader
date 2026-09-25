import { useCallback, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { SelectedValue } from "./selected-resource.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source, SourceId } from "@mdbase-reader/core";

export interface SourceFieldsController {
  /** False when the collection cannot edit source fields. */
  readonly available: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  /** Sets frontmatter fields; null removes one. Rejects after reporting the error. */
  readonly save: (fields: Readonly<Record<string, unknown>>) => Promise<void>;
}

/** Edits a selected source's friendly fields, publishing each saved record. */
export function useSourceFields(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly sourceId: SourceId | null;
  readonly onSaved: (source: Source) => void;
}): SourceFieldsController {
  const { gateway, sourceId, onSaved } = input;
  const [savingState, setSavingState] = useState<SelectedValue<number> | null>(null);
  const [errorState, setErrorState] = useState<SelectedValue<string | null> | null>(null);
  const saveFields = gateway.saveSourceFields?.bind(gateway);
  const save = useCallback(
    async (fields: Readonly<Record<string, unknown>>): Promise<void> => {
      if (!sourceId || !saveFields) {
        return;
      }
      setSavingState((current) => ({
        sourceId,
        value: (current?.sourceId === sourceId ? current.value : 0) + 1,
      }));
      setErrorState({ sourceId, value: null });
      try {
        onSaved(await saveFields(sourceId, fields));
      } catch (reason) {
        setErrorState({
          sourceId,
          value: readerErrorMessage(reason, "Reader could not save these details."),
        });
        throw reason;
      } finally {
        setSavingState((current) =>
          current?.sourceId === sourceId ? { sourceId, value: current.value - 1 } : current,
        );
      }
    },
    [onSaved, saveFields, sourceId],
  );
  return {
    available: saveFields !== undefined,
    saving: Boolean(sourceId && savingState?.sourceId === sourceId && savingState.value > 0),
    error: sourceId && errorState?.sourceId === sourceId ? errorState.value : null,
    save,
  };
}
