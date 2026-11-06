import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { dialogInvoker } from "./ModalDialog.js";

import type { SourceDeletionPlan, SourceId, SourceSummary } from "@mdbase-reader/core";

export interface PendingSourceRemoval {
  readonly source: SourceSummary;
  readonly status: "checking" | "confirming" | "removing";
  readonly plan: SourceDeletionPlan | null;
  readonly problem: string | null;
  readonly invoker: Element | null;
}

export interface SourceRemovalController {
  readonly notice: string | null;
  /** Asks to remove a source; null when this collection cannot remove sources. */
  readonly request: ((source: SourceSummary) => void) | null;
  readonly pending: PendingSourceRemoval | null;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

/**
 * Removing a source cannot be undone from Reader, so it always takes two steps: a check of the
 * source at its current revision, which lists the records linking to it, and then the reader's
 * confirmation. Cancelling at any point before confirming writes nothing.
 */
export function useSourceRemoval(
  writes: {
    readonly planSourceRemoval?: ((id: SourceId) => Promise<SourceDeletionPlan>) | undefined;
    readonly removeSource?: ((plan: SourceDeletionPlan) => Promise<void>) | undefined;
  },
  onRemoved: (id: SourceId) => void,
): SourceRemovalController {
  const { planSourceRemoval: plan, removeSource: remove } = writes;
  const [pending, setPending] = useState<PendingSourceRemoval | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  // Each request gets a number, so a check that finishes after a cancel is ignored.
  const attempt = useRef(0);
  const request = useCallback(
    (source: SourceSummary): void => {
      if (!plan) {
        return;
      }
      const current = ++attempt.current;
      const invoker = dialogInvoker(document.activeElement) ?? null;
      setPending({ source, status: "checking", plan: null, problem: null, invoker });
      void plan(source.id).then(
        (checked) => {
          if (attempt.current === current) {
            setPending({ source, status: "confirming", plan: checked, problem: null, invoker });
          }
        },
        (reason: unknown) => {
          if (attempt.current === current) {
            setPending({
              source,
              invoker,
              status: "confirming",
              plan: null,
              problem: readerErrorMessage(
                reason,
                t({ message: "Reader could not check this source." }),
              ),
            });
          }
        },
      );
    },
    [plan],
  );
  const cancel = useCallback((): void => {
    attempt.current += 1;
    setPending((current) => (current?.status === "removing" ? current : null));
  }, []);
  const confirm = (): void => {
    if (!remove || pending?.status !== "confirming" || !pending.plan) {
      return;
    }
    const { source, plan: checked } = pending;
    const current = ++attempt.current;
    setPending({ ...pending, status: "removing", problem: null });
    void remove(checked).then(
      () => {
        if (attempt.current === current) {
          setPending(null);
        }
        onRemoved(source.id);
        setNotice(t`Removed “${source.title}”.`);
      },
      (reason: unknown) => {
        if (attempt.current === current) {
          // The check is spent; asking again checks the source afresh.
          setPending({
            source,
            invoker: pending.invoker,
            status: "confirming",
            plan: null,
            problem: readerErrorMessage(
              reason,
              t({ message: "Reader could not remove this source." }),
            ),
          });
        }
      },
    );
  };
  return { request: plan && remove ? request : null, pending, cancel, confirm, notice };
}
