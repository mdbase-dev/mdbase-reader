import { MdbaseAppMark } from "@mdbase-dev/ui/brand";
import { CollectionSwitcher, type CollectionAppIdentity } from "@mdbase-dev/ui/collections";
import { createContext, useContext, type JSX } from "react";

import type { Mdbase } from "@mdbase-reader/connect/native";

/** Reader's identity in the shared collection screens. */
export const readerCollectionApp: CollectionAppIdentity = {
  name: "mdbase Reader",
  mark: <MdbaseAppMark app="reader" />,
};

/** Set by the SDK root: the header then shows the shared collection switcher. */
export const ReaderMdbaseContext = createContext<Mdbase | null>(null);

export function useReaderMdbase(): Mdbase | null {
  return useContext(ReaderMdbaseContext);
}

/** The shared switcher for the header; unsaved edits can keep Reader on this collection. */
export function ReaderCollectionSwitcher({
  mdbase,
  beforeSwitch,
}: {
  readonly mdbase: Mdbase;
  readonly beforeSwitch?: (() => boolean) | undefined;
}): JSX.Element {
  return (
    <CollectionSwitcher
      mdbase={mdbase}
      app={readerCollectionApp}
      variant="full"
      className="reader-collection-switcher"
      onBeforeLeave={beforeSwitch ? () => beforeSwitch() : undefined}
    />
  );
}
