import { useEffect, useSyncExternalStore } from "react";

import { annotationCreationBuffer } from "./annotation-creation-buffer.js";
import { confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { annotationDraftKey } from "./annotation-drafts.js";
import { useAnnotationOwner, type AnnotationOwnerControl } from "./use-annotation-owner.js";
import { useAreaSelectionMode } from "./use-area-selection-mode.js";
import { useCreationSaving } from "./use-creation-saving.js";
import { useSelectionRouting } from "./use-selection-routing.js";

import type { ComposerSelection } from "./annotation-composer-request.js";
import type { HighlightSaveTracker } from "./use-highlight-undo.js";
import type { SelectionToolbarController, TextComposerSelection } from "./use-selection-toolbar.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  SourceSummary,
  Annotation,
  AnnotationCreationRequest,
  HighlightColorKey,
  Source,
  SourceId,
} from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export interface AnnotationCreationInput {
  readonly sourceId: SourceId | null;
  readonly source: Source | null;
  readonly ownershipSources?: readonly SourceSummary[];
  readonly ownerGateway?: ReaderWorkspaceGateway;
  readonly surface: ReadingSurface | null;
  readonly create: (request: AnnotationCreationRequest) => Promise<Annotation>;
}
export interface AnnotationCreationController {
  readonly ownerControl?: AnnotationOwnerControl | undefined;
  readonly createOwned?: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly selection: ComposerSelection | null;
  readonly note: string;
  readonly status: "idle" | "saving";
  readonly error: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  /**
   * Drops a capture nobody has written about yet, as when the reader turns to a highlight.
   * A written comment stays open in the composer.
   */
  readonly setAside: () => void;
  readonly setNote: (note: string) => void;
  readonly dismiss: () => void;
  readonly save: () => void;
  /**
   * Saves a selection as a highlight at once, in `color` or the colour used last. `onSaved`
   * follows the saved highlight, as when its comment is to be written next.
   */
  readonly highlight: (
    selection: TextComposerSelection,
    color?: HighlightColorKey,
    onSaved?: (annotation: Annotation) => void,
  ) => void;
  readonly toggleAreaSelection: () => void;
}
function creationKey(source: Source | null, surface: ReadingSurface | null): string {
  return source && surface
    ? annotationDraftKey(source.collectionId, source.id, JSON.stringify(surface.document.document))
    : "";
}
export function useAnnotationCreation(
  input: AnnotationCreationInput,
  onSelection: () => void,
  toolbar: SelectionToolbarController,
  onCreated: (annotation: Annotation) => void,
  trackHighlight?: (value: TextComposerSelection, color: HighlightColorKey) => HighlightSaveTracker,
): AnnotationCreationController {
  const { sourceId, source, surface } = input;
  const key = creationKey(source, surface);
  const buffer = annotationCreationBuffer(
    key,
    source ? { collectionId: source.collectionId, sourceId: source.id } : undefined,
  );
  const draft = useSyncExternalStore(buffer.subscribe, buffer.getSnapshot, buffer.getSnapshot);
  useEffect(() => buffer.start(), [buffer]);
  const ownership = useCreationOwner(input, draft.value?.selection, toolbar);
  const saving = useCreationSaving({
    source,
    surface,
    buffer,
    create: ownership.create,
    onCreated,
    ...(trackHighlight ? { trackHighlight } : {}),
    beforeHighlight: toolbar.hide,
  });
  const { busy, setProblem } = saving;
  const area = useAreaSelectionMode(surface);
  // Only area captures (and drafts left by older versions) wait here; text saves as a highlight.
  const selection = draft.value?.selection ?? null;
  const open = (value: ComposerSelection): void => {
    buffer.replace({ body: "", selection: value });
    toolbar.hide();
    setProblem(null);
    area.endAreaSelection();
    onSelection();
  };
  useSelectionRouting({
    key,
    sourceId,
    surface,
    buffer,
    busy,
    compose: open,
    highlight: ownershipHighlight(input.ownershipSources, toolbar.showSelection, saving.highlight),
    showToolbar: toolbar.showSelection,
  });
  const dismiss = async (): Promise<void> => {
    const previous = buffer.get();
    if (
      busy.current ||
      (buffer.get()?.body.trim() &&
        !(await confirmAnnotationDiscard("Discard this unfinished annotation comment?")))
    ) {
      return;
    }
    if (buffer.get() !== previous) {
      return;
    }
    buffer.replace(null);
    surface?.capabilities.textSelection?.clearSelection();
    surface?.capabilities.areaSelection?.cancelAreaSelection();
    setProblem(null);
    area.endAreaSelection();
  };
  return {
    ownerControl: ownership.control,
    createOwned: ownership.create,
    selection,
    note: buffer.get()?.body ?? "",
    status: saving.saving ? "saving" : "idle",
    error: saving.problem?.sourceId === sourceId ? saving.problem.message : null,
    canSelectArea: area.canSelectArea,
    selectingArea: area.selectingArea,
    setAside: () => {
      const value = buffer.get();
      if (value && !value.body.trim() && !busy.current) {
        buffer.replace(null);
      }
    },
    setNote: (body) => {
      if (!busy.current) {
        buffer.edit(body);
      }
    },
    dismiss: () => void dismiss(),
    save: saving.save,
    highlight: saving.highlight,
    toggleAreaSelection: area.toggleAreaSelection,
  };
}

function useCreationOwner(
  input: AnnotationCreationInput,
  selection: ComposerSelection | null | undefined,
  toolbar: SelectionToolbarController,
): ReturnType<typeof useAnnotationOwner> {
  return useAnnotationOwner({
    source: input.source,
    surface: input.surface,
    create: input.create,
    selection:
      selection ??
      (toolbar.state?.target.kind === "selection" ? toolbar.state.target.selection : null),
    sources: input.ownershipSources,
    gateway: input.ownerGateway,
  });
}

/**
 * With several sources to save to, an instant highlight still shows the toolbar first, so its
 * source chip is seen before anything is saved.
 */
function ownershipHighlight(
  sources: readonly SourceSummary[] | undefined,
  showToolbar: (value: TextComposerSelection) => void,
  highlight: (value: TextComposerSelection) => void,
): (value: TextComposerSelection) => void {
  return sources && sources.length > 1 ? showToolbar : highlight;
}
