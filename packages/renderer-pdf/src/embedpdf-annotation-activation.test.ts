import { describe, expect, it, vi } from "vitest";

import { createEmbedPdfAnnotationActivations } from "./embedpdf-annotation-activation.js";

import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";

type AnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

describe("EmbedPDF annotation activations", () => {
  it("publishes each click on a durable Reader annotation, not every state change", () => {
    let stateListener: ((event: { state: { selectedUids: string[] } }) => void) | undefined;
    const selected = { id: "mdbase-reader:ann-clicked" } as PdfAnnotationObject;
    const capability = {
      onStateChange: (listener: typeof stateListener) => {
        stateListener = listener;
        return () => {
          stateListener = undefined;
        };
      },
      getSelectedAnnotations: () => [{ object: selected, commitState: "synced" as const }],
    } as unknown as AnnotationCapability;
    const activations = createEmbedPdfAnnotationActivations(capability);
    const listener = vi.fn();
    activations.subscribe(listener);

    const clicked = { state: { selectedUids: ["mdbase-reader:ann-clicked"] } };
    stateListener?.(clicked);
    // Other state changes keep the same selection list; only a fresh selection is a click.
    stateListener?.(clicked);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("ann-clicked");

    stateListener?.({ state: { selectedUids: ["mdbase-reader:ann-clicked"] } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores selected annotations that do not belong to Reader", () => {
    let stateListener: ((event: { state: { selectedUids: string[] } }) => void) | undefined;
    const capability = {
      onStateChange: (listener: typeof stateListener) => {
        stateListener = listener;
        return vi.fn();
      },
      getSelectedAnnotations: () => [
        { object: { id: "native-pdf-annotation" }, commitState: "synced" as const },
      ],
    } as unknown as AnnotationCapability;
    const activations = createEmbedPdfAnnotationActivations(capability);
    const listener = vi.fn();
    activations.subscribe(listener);

    stateListener?.({ state: { selectedUids: ["native-pdf-annotation"] } });

    expect(listener).not.toHaveBeenCalled();
  });
});
