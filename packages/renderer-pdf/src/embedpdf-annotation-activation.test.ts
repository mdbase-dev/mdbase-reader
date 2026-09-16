import { describe, expect, it, vi } from "vitest";

import { createEmbedPdfAnnotationActivations } from "./embedpdf-annotation-activation.js";

import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";

type AnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

describe("EmbedPDF annotation activations", () => {
  it("publishes selection of a durable Reader annotation once", () => {
    let stateListener: (() => void) | undefined;
    const selected = { id: "mdbase-reader:ann-clicked" } as PdfAnnotationObject;
    const capability = {
      onStateChange: (listener: () => void) => {
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

    stateListener?.();
    stateListener?.();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("ann-clicked");
  });

  it("ignores selected annotations that do not belong to Reader", () => {
    let stateListener: (() => void) | undefined;
    const capability = {
      onStateChange: (listener: () => void) => {
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

    stateListener?.();

    expect(listener).not.toHaveBeenCalled();
  });
});
