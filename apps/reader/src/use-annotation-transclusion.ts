import { annotationEmbed } from "@mdbase-reader/core";
import { useCallback, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, AnnotationId, Source } from "@mdbase-reader/core";

export interface AnnotationTransclusionController {
  readonly busyId: AnnotationId | null;
  readonly problemId: AnnotationId | null;
  readonly problem: string | null;
  readonly insert: (annotation: Annotation) => void;
  readonly isEmbedded: (annotation: Annotation) => boolean;
}

export function useAnnotationTransclusion(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly source: AsyncResource<Source>;
  readonly draft: string;
  readonly onSaved: (source: Source) => void;
}): AnnotationTransclusionController {
  const { gateway, source, draft, onSaved } = input;
  const [state, setState] = useState<{
    readonly busyId: AnnotationId | null;
    readonly problemId: AnnotationId | null;
    readonly problem: string | null;
  }>({ busyId: null, problemId: null, problem: null });
  const insert = useCallback(
    (annotation: Annotation): void => {
      if (source.status !== "ready" || state.busyId) {
        return;
      }
      setState({ busyId: annotation.id, problemId: null, problem: null });
      void persistAnnotationTransclusion(gateway, source.value, draft, annotation)
        .then((updated) => {
          onSaved(updated);
          setState({ busyId: null, problemId: null, problem: null });
        })
        .catch((reason: unknown) =>
          setState({
            busyId: null,
            problemId: annotation.id,
            problem: readerErrorMessage(reason, "Reader could not insert this annotation."),
          }),
        );
    },
    [draft, gateway, onSaved, source, state.busyId],
  );
  const isEmbedded = useCallback(
    (annotation: Annotation): boolean =>
      source.status === "ready" && source.value.body.includes(embedFor(annotation)),
    [source],
  );
  return { ...state, insert, isEmbedded };
}

export async function persistAnnotationTransclusion(
  gateway: ReaderWorkspaceGateway,
  source: Source,
  draft: string,
  annotation: Annotation,
): Promise<Source> {
  const current = source.body === draft ? source : await gateway.saveSourceBody(source, draft);
  return gateway.transcludeAnnotation(current, annotation);
}

function embedFor(annotation: Annotation): string {
  return annotationEmbed(annotation.path ?? `annotations/${annotation.id}.md`);
}
