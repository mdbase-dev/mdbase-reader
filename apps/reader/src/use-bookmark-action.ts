import { useRef, useState } from "react";

import { bookmarkRequest } from "./annotation-composer-request.js";
import { readerErrorMessage } from "./errors.js";

import type { Annotation, AnnotationCreationRequest, Source, SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface BookmarkAction {
  /** Whether the document has a current position to bookmark. */
  readonly canBookmark: boolean;
  readonly bookmarking: boolean;
  readonly problem: string | null;
  /** Saves a bookmark at the current reading position. */
  readonly bookmark: () => void;
}

export function useBookmarkAction(input: {
  readonly sourceId: SourceId | null;
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly onCreated: (annotation: Annotation) => void;
}): BookmarkAction {
  const { sourceId, source, surface, create, onCreated } = input;
  const busy = useRef(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [problem, setProblem] = useState<{
    readonly sourceId: SourceId;
    readonly message: string;
  } | null>(null);
  return {
    canBookmark: source !== null && surface !== null,
    bookmarking,
    problem: problem?.sourceId === sourceId ? problem.message : null,
    bookmark: () => {
      const request = source && surface ? bookmarkRequest(source, surface) : null;
      if (!source || !request || busy.current) {
        return;
      }
      busy.current = true;
      setBookmarking(true);
      setProblem(null);
      void create(request)
        .then(onCreated)
        .catch((reason: unknown) =>
          setProblem({
            sourceId: source.id,
            message: readerErrorMessage(reason, "Reader could not save this bookmark."),
          }),
        )
        .finally(() => {
          busy.current = false;
          setBookmarking(false);
        });
    },
  };
}
