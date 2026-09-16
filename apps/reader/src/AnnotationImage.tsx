import { useEffect, useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";

import type { AnnotationImageEmbed } from "./annotation-body-content.js";
import type { ExportedCollectionFile, ReaderRequestOptions } from "@mdbase-reader/core";

export type AnnotationFileReader = (
  path: string,
  options?: ReaderRequestOptions,
) => Promise<ExportedCollectionFile>;

type ImageState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly url: string }
  | { readonly status: "error"; readonly message: string };

export function AnnotationImage({
  image,
  readFile,
}: {
  readonly image: AnnotationImageEmbed;
  readonly readFile: AnnotationFileReader;
}): JSX.Element {
  const [state, setState] = useState<ImageState>({ status: "loading" });
  useEffect(() => {
    const request = new AbortController();
    let objectUrl: string | null = null;
    void readFile(image.path, { signal: request.signal })
      .then((file) => {
        if (request.signal.aborted) {
          return;
        }
        if (!file.mediaType.startsWith("image/")) {
          throw new Error("The embedded annotation asset is not an image.");
        }
        objectUrl = URL.createObjectURL(
          new Blob([file.bytes.slice().buffer], { type: file.mediaType }),
        );
        setState({ status: "ready", url: objectUrl });
      })
      .catch((reason: unknown) => {
        if (!request.signal.aborted) {
          setState({
            status: "error",
            message: readerErrorMessage(reason, "Reader could not display this screenshot."),
          });
        }
      });
    return () => {
      request.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [image.path, readFile]);
  return state.status === "ready" ? (
    <figure className="annotation-card-image">
      <img src={state.url} alt={image.alt} />
    </figure>
  ) : state.status === "error" ? (
    <p className="annotation-card-asset-status is-error" role="alert">
      {state.message}
    </p>
  ) : (
    <div className="annotation-card-asset-status" role="status">
      Loading screenshot…
    </div>
  );
}
