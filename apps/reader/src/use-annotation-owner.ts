import { useEffect, useMemo, useState } from "react";

import { useAnnotationOwnerPreference } from "./annotation-owner-preference.js";
import {
  AnnotationSaveCancelled,
  annotationOwnerChoices,
  annotationWithOwner,
  defaultAnnotationOwner,
  type AnnotationOwnerDecision,
  type AnnotationOwnershipInput,
} from "./annotation-ownership.js";
import { requestConfirmation } from "./confirmation.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  AnnotationTarget,
  Source,
  SourceSummary,
} from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface AnnotationOwnerControl {
  readonly ownerId: string;
  readonly sources: readonly SourceSummary[];
  readonly choices: readonly SourceSummary[];
  readonly reason: string;
  readonly pending: boolean;
  readonly choose: (id: string) => void;
}
interface OwnerInput {
  readonly source: Source | null;
  readonly surface: ReadingSurface | null;
  readonly selection: ComposerSelection | null;
  readonly sources?: readonly SourceSummary[] | undefined;
  readonly gateway?: ReaderWorkspaceGateway | undefined;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
}
function decisionInput(
  source: Source,
  sources: readonly SourceSummary[],
  preference: "chapter" | "book",
  surface: ReadingSurface | null,
  target: AnnotationTarget | undefined,
): AnnotationOwnershipInput {
  return {
    source,
    sources,
    preference,
    document: surface?.document.document,
    target,
    contains: surface?.capabilities.annotationRange?.contains,
  };
}
export function useAnnotationOwner(input: OwnerInput): {
  readonly control: AnnotationOwnerControl | undefined;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
} {
  const { source, surface, selection } = input;
  const preference = useAnnotationOwnerPreference();
  const sources = useMemo(() => input.sources ?? (source ? [source] : []), [input.sources, source]);
  const target = useMemo(() => selectionTarget(selection), [selection]);
  const [resolved, setResolved] = useState<{
    readonly key: string;
    readonly decision: AnnotationOwnerDecision;
    readonly choices: readonly SourceSummary[];
  } | null>(null);
  const key = useMemo(
    () =>
      JSON.stringify([
        source?.id,
        source?.recordRevision,
        sources,
        surface?.document.document,
        target,
        preference,
      ]),
    [source, sources, surface, target, preference],
  );
  const [chosen, setChosen] = useState<{ readonly key: string; readonly id: string } | null>(null);
  useEffect(() => {
    if (!source) {
      return undefined;
    }
    let active = true;
    const ownership = decisionInput(source, sources, preference, surface, target);
    void Promise.all([defaultAnnotationOwner(ownership), annotationOwnerChoices(ownership)])
      .then(([decision, choices]) => {
        if (active) {
          setResolved({ key, decision, choices });
        }
      })
      .catch(() => {
        if (active) {
          setResolved({
            key,
            choices: [source],
            decision: {
              owner: source,
              reason: "Chapter boundaries could not be verified; keeping the current source.",
            },
          });
        }
      });
    return () => {
      active = false;
    };
  }, [key, preference, source, sources, surface, target]);
  const explicit = chosen?.key === key ? sources.find(({ id }) => id === chosen.id) : undefined;
  const decision = resolved?.key === key ? resolved.decision : null;
  const owner = explicit ?? decision?.owner ?? source;
  return {
    control: owner
      ? {
          ownerId: owner.id,
          sources,
          choices: resolved?.key === key ? resolved.choices : [owner],
          pending: !decision,
          reason: explicit
            ? "Source chosen. Existing note embeds will not move."
            : (decision?.reason ?? "Checking chapter boundaries…"),
          choose: (id) => setChosen({ key, id }),
        }
      : undefined,
    create: (request) => saveOwnedAnnotation(request, input, sources, preference, explicit),
  };
}

function selectionTarget(selection: ComposerSelection | null): AnnotationTarget | undefined {
  if (selection?.kind === "text") {
    return selection.value.target;
  }
  return selection?.kind === "area"
    ? { position: { kind: "pdf", pageIndex: selection.value.pageIndex } }
    : undefined;
}

async function saveOwnedAnnotation(
  request: AnnotationCreationRequest,
  input: OwnerInput,
  sources: readonly SourceSummary[],
  preference: "chapter" | "book",
  explicit: SourceSummary | undefined,
): Promise<Annotation> {
  const { source, gateway, surface } = input;
  if (!source || !gateway || sources.length <= 1) {
    return input.create(request);
  }
  // Bookmarks always use the location default, never a composer’s previous owner choice.
  const chosen = request.annotationType === "bookmark" ? undefined : explicit;
  const proposed =
    chosen ??
    (
      await defaultAnnotationOwner({
        ...decisionInput(source, sources, preference, surface, request.target),
        document: request.document,
      })
    ).owner;
  // Comments and selection saves disclose ownership in AnnotationOwnerChooser.
  const fullOwner = proposed.id === source.id ? source : await gateway.source(proposed.id);
  if (!fullOwner) {
    throw new Error("The chosen source no longer exists. Choose another source.");
  }
  if (chosen) {
    await confirmExplicitOwner(request, fullOwner, surface);
  }
  return input.create(annotationWithOwner(request, fullOwner));
}

async function confirmExplicitOwner(
  request: AnnotationCreationRequest,
  owner: Source,
  surface: ReadingSurface | null,
): Promise<void> {
  if (!request.document) {
    return;
  }
  const document = owner.documents.find(({ fileId }) => fileId === request.document?.fileId);
  const contains =
    document?.range && request.target && document.revision === request.document.revision
      ? await surface?.capabilities.annotationRange?.contains(document.range, request.target)
      : !document?.range;
  if (
    (!document || contains !== true) &&
    !(await requestConfirmation({
      title: `Save annotation to “${owner.title}”?`,
      message:
        "The chosen source does not list this document or its verified range does not contain the selector. The document target will remain unchanged.",
      confirmLabel: "Save annotation",
      cancelLabel: "Choose another source",
    }))
  ) {
    throw new AnnotationSaveCancelled();
  }
}
