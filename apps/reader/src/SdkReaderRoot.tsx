import { CollectionGate } from "@mdbase-dev/ui/collections";
import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { OpeningScreen } from "@mdbase-dev/ui/screens";
import {
  nativeReaderCollection,
  type Mdbase,
  type MdbaseApplicationConnection,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { BrowserStorage } from "@mdbase-reader/platform";
import { useEffect, useState, type JSX, type ReactNode } from "react";

import { createJournals } from "./create-journals.js";
import { lazyFeature } from "./lazy-feature.js";
import { readerCollectionApp, ReaderMdbaseContext } from "./reader-collections.js";
import "@mdbase-dev/ui/collections.css";
import "./reader-collections.css";

const ReaderWorkspace = lazyFeature(
  async () => ({ default: (await import("./ReaderWorkspace.js")).ReaderWorkspace }),
  "the reading workspace",
);

export type ReaderSdk = Mdbase;

/** Where record creates are kept in this browser until the collection confirms them. */
const createJournalsHere = createJournals(new BrowserStorage());

function useClearCreatesOnSignOut(sdk: ReaderSdk): void {
  useEffect(() => createJournalsHere.clearOnSignOut(sdk), [sdk]);
}

export interface ReaderNativeScope {
  readonly mdbase: Mdbase;
  readonly connection: MdbaseApplicationConnection;
  readonly collection: NativeReaderCollection;
}

export interface SdkReaderRootProps {
  readonly sdk: ReaderSdk;
  /** Inside an existing page (the import flow): the shared screens render as a panel. */
  readonly embedded?: boolean;
  /** Real native domain UI only; defaults to the reading workspace over the native collection. */
  readonly renderNative?: (scope: ReaderNativeScope) => ReactNode;
}

/**
 * Reader over the SDK's mdbase entry. The shared collection gate starts it and
 * owns sign-in, choosing, approval, setup and problems; Reader opens its
 * workspace only for the connection the gate hands over in phase `ready`, and
 * never closes the entry. This is the entry for every build environment
 * (see docs/new-sdk.md).
 */
export function SdkReaderRoot({
  sdk,
  embedded = false,
  renderNative,
}: SdkReaderRootProps): JSX.Element {
  useClearCreatesOnSignOut(sdk);
  return (
    <ReaderMdbaseContext value={sdk}>
      <CollectionGate
        mdbase={sdk}
        app={readerCollectionApp}
        layout={embedded ? "panel" : "page"}
        extraActions={embedded ? undefined : <FeedbackButton />}
      >
        {(connection) => (
          <NativeScopeView
            key={`${connection.id}:${connection.generation}`}
            mdbase={sdk}
            connection={connection}
            renderNative={renderNative}
          />
        )}
      </CollectionGate>
    </ReaderMdbaseContext>
  );
}

function NativeScopeView({
  mdbase,
  connection,
  renderNative,
}: {
  readonly mdbase: Mdbase;
  readonly connection: MdbaseApplicationConnection;
  readonly renderNative: SdkReaderRootProps["renderNative"];
}): ReactNode {
  // The parent keys by SDK collection ID and generation. A later snapshot may hand
  // back a new facade for the same scope; it must not retire these adapters.
  const [original] = useState(connection);
  const [collection, setCollection] = useState<NativeReaderCollection | null>(null);
  useEffect(() => {
    // The native gate does not need gateways/renderers while choosing or authorizing.
    // Once ready, overlap workspace code with construction of its collection adapter.
    if (!renderNative) {
      ReaderWorkspace.preload();
    }
  }, [renderNative]);
  useEffect(() => {
    const opened = nativeReaderCollection(original, {
      creates: createJournalsHere.journalFor(original.scope.account),
    });
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setCollection(opened);
      }
    });
    return () => {
      active = false;
      opened.dispose();
    };
  }, [original]);
  if (!collection) {
    return <OpeningScreen app="reader" title={`Opening ${original.displayName}`} />;
  }
  return renderNative ? (
    renderNative({ mdbase, connection: original, collection })
  ) : (
    <ReaderWorkspace opened={collection} />
  );
}
