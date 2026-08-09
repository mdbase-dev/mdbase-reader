import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceId, SourceSummary } from "@mdbase-reader/core";

export type AsyncResource<Value> =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly value: Value }
  | { readonly status: "error"; readonly message: string };

export interface ReaderWorkspaceController {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly sourceRecord: AsyncResource<Source>;
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly draft: string;
  readonly saveStatus: "idle" | "saving";
  readonly saveError: string | null;
  readonly selectSource: (id: SourceId) => void;
  readonly setDraft: (value: string) => void;
  readonly saveDraft: () => void;
  readonly retryLibrary: () => void;
}

export function useReaderWorkspace(gateway: ReaderWorkspaceGateway): ReaderWorkspaceController {
  const [library, setLibrary] = useState<AsyncResource<ReaderLibrarySnapshot>>({
    status: "loading",
  });
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const selectedSourceIdRef = useRef<SourceId | null>(null);
  const [sourceRecord, setSourceRecord] = useState<AsyncResource<Source>>({ status: "idle" });
  const [annotations, setAnnotations] = useState<AsyncResource<readonly Annotation[]>>({
    status: "idle",
  });
  const [draft, setDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectSource = useCallback((id: SourceId): void => {
    selectedSourceIdRef.current = id;
    setSelectedSourceId(id);
    setSourceRecord({ status: "loading" });
    setAnnotations({ status: "loading" });
    setDraft("");
    setSaveError(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void gateway
      .library({ signal: controller.signal })
      .then((snapshot) => {
        if (controller.signal.aborted) {
          return;
        }
        setLibrary({ status: "ready", value: snapshot });
        const current = selectedSourceIdRef.current;
        const next =
          current && snapshot.sources.some(({ id }) => id === current)
            ? current
            : (snapshot.sources[0]?.id ?? null);
        selectedSourceIdRef.current = next;
        setSelectedSourceId(next);
        if (next) {
          setSourceRecord({ status: "loading" });
          setAnnotations({ status: "loading" });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLibrary({
            status: "error",
            message: readerErrorMessage(reason, "Reader could not load this collection."),
          });
        }
      });
    return () => controller.abort();
  }, [gateway, libraryAttempt]);

  const selectedSource = useMemo(() => {
    if (library.status !== "ready" || !selectedSourceId) {
      return null;
    }
    return library.value.sources.find(({ id }) => id === selectedSourceId) ?? null;
  }, [library, selectedSourceId]);

  useEffect(() => {
    if (!selectedSource) {
      return;
    }

    const controller = new AbortController();
    void gateway
      .source(selectedSource.id, { signal: controller.signal })
      .then((source) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!source) {
          setSourceRecord({ status: "error", message: "This source record no longer exists." });
          return;
        }
        setSourceRecord({ status: "ready", value: source });
        setDraft(source.body);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setSourceRecord({
            status: "error",
            message: readerErrorMessage(reason, "Reader could not open the source note."),
          });
        }
      });

    void gateway
      .annotations(selectedSource.id, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setAnnotations({ status: "ready", value: items });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setAnnotations({
            status: "error",
            message: readerErrorMessage(reason, "Reader could not load this source's annotations."),
          });
        }
      });

    return () => controller.abort();
  }, [gateway, selectedSource]);

  const saveDraft = useCallback((): void => {
    if (sourceRecord.status !== "ready" || sourceRecord.value.body === draft) {
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    void gateway
      .saveSourceBody(sourceRecord.value, draft)
      .then((updated) => setSourceRecord({ status: "ready", value: updated }))
      .catch((reason: unknown) =>
        setSaveError(readerErrorMessage(reason, "Reader could not save the source note.")),
      )
      .finally(() => setSaveStatus("idle"));
  }, [draft, gateway, sourceRecord]);

  const retryLibrary = useCallback((): void => {
    setLibrary({ status: "loading" });
    setLibraryAttempt((attempt) => attempt + 1);
  }, []);

  return {
    library,
    selectedSource,
    sourceRecord,
    annotations,
    draft,
    saveStatus,
    saveError,
    selectSource,
    setDraft,
    saveDraft,
    retryLibrary,
  };
}
