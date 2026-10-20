import { CollectionGate } from "@mdbase-dev/ui/collections";
import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { OpeningScreen } from "@mdbase-dev/ui/screens";
import {
  nativeReaderCollection,
  type Mdbase,
  type MdbaseApplicationConnection,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { useEffect, useState, type JSX, type ReactNode } from "react";

import { readerCollectionApp, ReaderMdbaseContext } from "./reader-collections.js";
import { ReaderWorkspace } from "./ReaderWorkspace.js";
import "@mdbase-dev/ui/collections.css";
import "./reader-collections.css";

export type ReaderSdk = Mdbase;

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
    const opened = nativeReaderCollection(original);
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
