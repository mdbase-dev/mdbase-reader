import { useCallback, useEffect, useMemo, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { defaultLibraryView } from "./mdbase-library-views.js";

import type { LibraryViewSaveRequest, MdbaseLibraryView } from "./mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

export interface MdbaseLibraryViewsController {
  readonly views: readonly MdbaseLibraryView[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly problem: string | null;
  readonly view: (key: string) => MdbaseLibraryView;
  readonly refresh: () => Promise<void>;
  readonly save: (request: LibraryViewSaveRequest) => Promise<MdbaseLibraryView>;
}

export function useMdbaseLibraryViews(
  gateway: ReaderWorkspaceGateway,
  enabled = true,
): MdbaseLibraryViewsController {
  const [views, setViews] = useState<readonly MdbaseLibraryView[]>([defaultLibraryView]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setProblem(null);
    try {
      setViews(await gateway.listLibraryViews());
    } catch (reason) {
      setProblem(readerErrorMessage(reason, "Reader could not load saved library views."));
      setViews([defaultLibraryView]);
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, refresh]);

  const save = useCallback(
    async (request: LibraryViewSaveRequest): Promise<MdbaseLibraryView> => {
      setSaving(true);
      setProblem(null);
      try {
        const saved = await gateway.saveLibraryView(request);
        setViews((current) => [
          ...current.filter(({ key }) => key !== saved.key && key !== request.existing?.key),
          saved,
        ]);
        return saved;
      } catch (reason) {
        const message = readerErrorMessage(reason, "Reader could not save this library view.");
        setProblem(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [gateway],
  );

  return useMemo(
    () => ({
      views,
      loading,
      saving,
      problem,
      view: (key: string) => views.find((candidate) => candidate.key === key) ?? defaultLibraryView,
      refresh,
      save,
    }),
    [loading, problem, refresh, save, saving, views],
  );
}
