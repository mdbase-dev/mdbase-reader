import { useCallback, useEffect, useRef, useState } from "react";

import { problemMessage } from "./capture-model.js";

/** What failed, so the panel can offer the matching recovery. */
export type ProblemKind = "connection" | "save" | "page";

export interface ActionLock {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly problemKind: ProblemKind | null;
  readonly notice: string | null;
  readonly setProblem: (problem: string | null, kind?: ProblemKind) => void;
  readonly setNotice: (notice: string | null) => void;
  /**
   * Runs one explicit action at a time; a second request while busy is ignored. A failure
   * is reported as `kind`.
   */
  readonly run: (action: () => Promise<void>, kind?: ProblemKind) => Promise<void>;
  /** Releases the initial lock once the panel has finished opening. */
  readonly release: () => void;
  readonly locked: () => boolean;
}

export function useActionLock(onSettled?: () => void): ActionLock {
  const lock = useRef(true);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<{
    readonly problem: string;
    readonly kind: ProblemKind;
  } | null>(null);
  const setProblem = useCallback(
    (problem: string | null, kind: ProblemKind = "connection"): void =>
      setFailure(problem ? { problem, kind } : null),
    [],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);
  const run = useCallback(
    async (action: () => Promise<void>, kind: ProblemKind = "connection"): Promise<void> => {
      if (lock.current) {
        return;
      }
      lock.current = true;
      setBusy(true);
      setFailure(null);
      setNotice(null);
      try {
        await action();
      } catch (reason) {
        setFailure({ problem: problemMessage(reason), kind });
      } finally {
        lock.current = false;
        setBusy(false);
        settled.current?.();
      }
    },
    [],
  );
  const release = useCallback(() => {
    lock.current = false;
    setBusy(false);
  }, []);
  const locked = useCallback(() => lock.current, []);
  return {
    busy,
    problem: failure?.problem ?? null,
    problemKind: failure?.kind ?? null,
    notice,
    setProblem,
    setNotice,
    run,
    release,
    locked,
  };
}
