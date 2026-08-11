import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryLensId } from "./library-lenses.js";
import type { SourceSummary } from "@mdbase-reader/core";

export type LibrarySort = "recent" | "title" | "creator" | "published";

export interface SavedLibraryLens {
  readonly id: string;
  readonly name: string;
  readonly lens: LibraryLensId;
  readonly query: string;
  readonly sort: LibrarySort;
}

export interface LibraryViewState {
  readonly query: string;
  readonly lens: LibraryLensId;
  readonly sort: LibrarySort;
  readonly saved: readonly SavedLibraryLens[];
  readonly setQuery: (value: string) => void;
  readonly setLens: (value: LibraryLensId) => void;
  readonly setSort: (value: LibrarySort) => void;
  readonly save: (name: string) => void;
  readonly apply: (id: string) => void;
  readonly remove: (id: string) => void;
}

export function useLibraryViewState(collectionKey: string): LibraryViewState {
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<LibraryLensId>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [saved, setSaved] = useState<readonly SavedLibraryLens[]>(() => loadSaved(collectionKey));
  useEffect(() => saveSaved(collectionKey, saved), [collectionKey, saved]);
  const save = useCallback(
    (name: string): void => {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      setSaved((current) => [
        ...current.filter((item) => item.name.toLocaleLowerCase() !== trimmed.toLocaleLowerCase()),
        { id: crypto.randomUUID(), name: trimmed, lens, query, sort },
      ]);
    },
    [lens, query, sort],
  );
  const apply = useCallback(
    (id: string): void => {
      const item = saved.find((candidate) => candidate.id === id);
      if (!item) {
        return;
      }
      setQuery(item.query);
      setLens(item.lens);
      setSort(item.sort);
    },
    [saved],
  );
  const remove = useCallback(
    (id: string): void => setSaved((current) => current.filter((item) => item.id !== id)),
    [],
  );
  return useMemo(
    () => ({ query, lens, sort, saved, setQuery, setLens, setSort, save, apply, remove }),
    [apply, lens, query, remove, save, saved, sort],
  );
}

export function sortLibrarySources(
  sources: readonly SourceSummary[],
  sort: LibrarySort,
  recentSourceIds: readonly SourceSummary["id"][],
): readonly SourceSummary[] {
  const recentRank = new Map(recentSourceIds.map((id, index) => [id, index]));
  return [...sources].sort((left, right) => {
    if (sort === "recent") {
      return (
        (recentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (recentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (sort === "published") {
      return publicationYear(right) - publicationYear(left);
    }
    const leftValue = sort === "creator" ? (left.creators[0] ?? "") : left.title;
    const rightValue = sort === "creator" ? (right.creators[0] ?? "") : right.title;
    return leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" });
  });
}

function publicationYear(source: SourceSummary): number {
  return typeof source.published === "number"
    ? source.published
    : Number.parseInt(source.published ?? "0", 10) || 0;
}

const storagePrefix = "mdbase-reader:library-lenses:v1:";

function loadSaved(collectionKey: string): readonly SavedLibraryLens[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`${storagePrefix}${collectionKey}`) ?? "[]",
    );
    return Array.isArray(value) ? (value as SavedLibraryLens[]) : [];
  } catch {
    return [];
  }
}

function saveSaved(collectionKey: string, saved: readonly SavedLibraryLens[]): void {
  localStorage.setItem(`${storagePrefix}${collectionKey}`, JSON.stringify(saved));
}
