import {
  cslValuesEqual,
  type CslProvenance,
  type Source,
  type SourceId,
} from "@mdbase-reader/core";
import { parentCitationClaims, type Claim } from "@mdbase-reader/web-capture/citation-updates";
import { useEffect, useRef, useState } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

interface ParentRead {
  readonly scope: string;
  readonly identity: string;
  readonly parent: Source;
  readonly claims: readonly Claim[];
}

function ambiguousParent(source: Source | null): boolean {
  const parents = source?.relations?.filter(({ relation }) => relation === "part-of") ?? [];
  return new Set(parents.map(({ target }) => target)).size > 1;
}

async function readImmediateBook(
  gateway: ReaderWorkspaceGateway,
  childId: SourceId,
  signal: AbortSignal,
): Promise<Source | null> {
  const get = (gateway.refreshSource ?? gateway.source).bind(gateway);
  const child = await get(childId, { signal });
  if (!child?.partOf || ambiguousParent(child)) {
    return null;
  }
  const parent = await get(child.partOf, { signal });
  return parent?.citation?.type === "book" ? parent : null;
}

/** Only accepted, still-derived values are stale previews; saved values and manual edits are not. */
async function checkReviewedParent(
  gateway: ReaderWorkspaceGateway,
  source: Source | null,
  identity: string,
  accepted: ReadonlyMap<string, ParentRead>,
  citation: Readonly<Record<string, unknown>> | null,
  provenance: CslProvenance,
): Promise<void> {
  const relevant = [...accepted].filter(([field, read]) => {
    const label = provenance[field]?.source;
    return (
      read.identity === identity &&
      (label === "parent" || label?.startsWith("parent ")) &&
      cslValuesEqual(citation?.[field], read.claims.find((claim) => claim.field === field)?.value)
    );
  });
  if (!source || !relevant.length) {
    return;
  }
  const get = (gateway.refreshSource ?? gateway.source).bind(gateway);
  const child = await get(source.id);
  const parent = child?.partOf && !ambiguousParent(child) ? await get(child.partOf) : null;
  const claims = parentCitationClaims(
    parent?.citation ?? {},
    parent?.cslProvenance,
    new Date().toISOString(),
  );
  if (
    !parent ||
    relevant.some(
      ([field, read]) =>
        read.parent.id !== parent.id ||
        !cslValuesEqual(citation?.[field], claims.find((claim) => claim.field === field)?.value),
    )
  ) {
    throw new Error(
      "The book or parent relation changed. Review the latest From the book suggestions before saving.",
    );
  }
}

/** Local-only, immediate-container suggestions. Never writes either record. */
export function useParentCitation(
  gateway: ReaderWorkspaceGateway,
  source: Source | null,
  enabled: boolean,
): {
  readonly claims: readonly Claim[];
  readonly reviewed: (fields: readonly string[]) => void;
  readonly checkBeforeSave: (
    citation: Readonly<Record<string, unknown>> | null,
    provenance: CslProvenance,
  ) => Promise<() => void>;
} {
  const identity = JSON.stringify([source?.collectionId, source?.id]);
  const scope = JSON.stringify([identity, source?.partOf]);
  const [read, setRead] = useState<ParentRead | null>(null);
  const [version, setVersion] = useState(0);
  const accepted = useRef(new Map<string, ParentRead>());
  useEffect(() => {
    const changed = (): void => setVersion((value) => value + 1);
    const stopLocal = gateway.subscribeCitationChanges?.(changed);
    const stopExternal = gateway.subscribeLibrary?.(changed);
    return () => {
      stopLocal?.();
      stopExternal?.();
    };
  }, [gateway]);
  const parentId = source?.partOf;
  const childId = source?.id;
  const ambiguous = ambiguousParent(source);
  useEffect(() => {
    if (!enabled || !childId || (!parentId && version === 0) || ambiguous) {
      return undefined;
    }
    const controller = new AbortController();
    void readImmediateBook(gateway, childId, controller.signal)
      .then((parent) => {
        if (!controller.signal.aborted) {
          setRead(
            parent
              ? {
                  identity,
                  scope,
                  parent,
                  claims: parentCitationClaims(
                    parent.citation ?? {},
                    parent.cslProvenance,
                    new Date().toISOString(),
                  ),
                }
              : null,
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRead(null);
        }
      });
    return () => controller.abort();
  }, [gateway, identity, scope, parentId, childId, ambiguous, enabled, version]);
  const current = enabled && !ambiguous && read?.scope === scope ? read : null;
  return {
    claims: current?.claims ?? [],
    reviewed: (fields) => {
      if (current) {
        for (const field of fields) {
          accepted.current.set(field, current);
        }
      }
    },
    checkBeforeSave: async (citation, provenance) => {
      const snapshot = new Map(accepted.current);
      try {
        await checkReviewedParent(gateway, source, identity, snapshot, citation, provenance);
      } catch (error) {
        setVersion((value) => value + 1);
        throw error;
      }
      // Clear only saved accepts; a newer edit made while saving keeps its own review guard.
      return () => {
        for (const [field, baseline] of snapshot) {
          if (accepted.current.get(field) === baseline) {
            accepted.current.delete(field);
          }
        }
      };
    },
  };
}
