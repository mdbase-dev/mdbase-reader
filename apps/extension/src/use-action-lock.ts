import { useCallback, useEffect, useRef, useState } from "react";

import { problemMessage } from "./capture-model.js";

export interface ActionLock {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly notice: string | null;
  readonly setProblem: (problem: string | null) => void;
  readonly setNotice: (notice: string | null) => void;
  /** Runs one explicit action at a time; a second request while busy is ignored. */
  readonly run: (action: () => Promise<void>) => Promise<void>;
  /** Releases the initial lock once the panel has finished opening. */
  readonly release: () => void;
  readonly locked: () => boolean;
}

export function useActionLock(onSettled?: () => void): ActionLock {
  const lock = useRef(true);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);
  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setProblem(problemMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
      settled.current?.();
    }
  }, []);
  const release = useCallback(() => {
    lock.current = false;
    setBusy(false);
  }, []);
  const locked = useCallback(() => lock.current, []);
  return { busy, problem, notice, setProblem, setNotice, run, release, locked };
}
