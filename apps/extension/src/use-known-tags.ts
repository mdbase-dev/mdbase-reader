import { useRef, useState } from "react";

import { loadKnownTags } from "./tag-suggestions.js";

import type { ExtensionSession } from "./connect-session.js";
import type { Annotation } from "@mdbase-reader/core";

/** Tags to suggest for the connected collection, loaded when a tag field is first used. */
export function useKnownTags(
  extension: ExtensionSession | null,
  annotations: readonly Annotation[],
): { readonly knownTags: readonly string[]; readonly loadTags: () => void } {
  const collection = extension?.session.connectedCollection() ?? null;
  const [known, setKnown] = useState<{
    readonly collectionId: string;
    readonly tags: readonly string[];
  } | null>(null);
  const loading = useRef<string | null>(null);
  const loadTags = (): void => {
    if (!collection || loading.current === collection.collectionId) {
      return;
    }
    const { collectionId } = collection;
    loading.current = collectionId;
    void loadKnownTags(collection, annotations)
      .then((tags) => setKnown({ collectionId, tags }))
      .catch(() => {
        loading.current = null;
      });
  };
  const current = known && known.collectionId === collection?.collectionId ? known.tags : [];
  return { knownTags: current, loadTags };
}
