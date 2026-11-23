import { Trans } from "@lingui/react/macro";
import { useCallback, type JSX } from "react";

import { AnnotationEditingContext } from "./AnnotationEditingContext.js";
import { AnnotationList } from "./AnnotationList.js";
import { useCollectionAnnotations } from "./use-collection-annotations.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

const nothing = (): void => undefined;

/**
 * Every annotation in the collection, in the same list the Notes panel shows for one source:
 * the same cards, search, filters and Copy as Markdown, with each annotation naming its source.
 */
export function CollectionAnnotations({
  gateway,
  sources,
  onOpenAnnotation,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly sources: readonly SourceSummary[];
  /** Opens the annotation in its source's document. */
  readonly onOpenAnnotation: (annotation: Annotation) => void;
}): JSX.Element {
  const { annotations, change, retry } = useCollectionAnnotations(gateway);
  const readFile = useCallback(
    (path: string, options?: Parameters<ReaderWorkspaceGateway["readFile"]>[2]) =>
      gateway.readFile(path, undefined, options),
    [gateway],
  );
  const recolor = gateway.setAnnotationColor?.bind(gateway);
  return (
    <div className="library-annotations annotation-workspace">
      <AnnotationEditingContext value={gateway}>
        <AnnotationList
          collection
          annotations={annotations}
          owners={sources}
          beforeList={
            annotations.status === "error" ? (
              <button type="button" className="library-annotations-retry" onClick={retry}>
                <Trans context="Reader action">Try again</Trans>
              </button>
            ) : null
          }
          onUpdate={async (annotation, body) => {
            const updated = await gateway.updateAnnotation(annotation, body);
            change(annotation, updated);
            return updated;
          }}
          onRecolor={
            recolor
              ? async (annotation, color) => change(annotation, await recolor(annotation, color))
              : undefined
          }
          onPlanDelete={(annotation) => gateway.planAnnotationDeletion(annotation)}
          onDelete={async (annotation, plan) => {
            await gateway.deleteAnnotation(annotation, plan);
            change(annotation, null);
          }}
          onOpen={onOpenAnnotation}
          editingId={null}
          activeId={null}
          onCancelEdit={nothing}
          readFile={readFile}
        />
      </AnnotationEditingContext>
    </div>
  );
}
