import { OpeningScreen } from "@mdbase-dev/ui/screens";
import { createReaderRuntimeServices, createWebPlatform } from "@mdbase-reader/platform";
import { lazy, Suspense, useMemo, type JSX } from "react";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";
import { ConnectedDocument } from "./ConnectedDocument.js";
import { requestedAnnotation, requestedSourceId } from "./SourceDeepLink.js";

import type { ReaderApp as ReaderAppComponent } from "./ReaderApp.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";

export const loadReaderApp = (): Promise<{ readonly ReaderApp: typeof ReaderAppComponent }> =>
  import("./ReaderApp.js");
const ReaderApp = lazy(async () => ({ default: (await loadReaderApp()).ReaderApp }));

const readerPlatform = createWebPlatform();
const runtimeServices = createReaderRuntimeServices(readerPlatform.storage);

/** The reading workspace over one opened collection, from Connect or the native SDK. */
export function ReaderWorkspace({
  opened,
}: {
  readonly opened: ReaderConnectedCollection;
}): JSX.Element {
  const gateway = useMemo(
    () =>
      new ConnectWorkspaceGateway(
        opened.sources,
        opened.annotations,
        opened.annotationAssets,
        opened.sourceImports,
        opened.collectionId,
        opened.collectionName,
        runtimeServices,
        opened.contentSearch,
        opened.files,
        opened.libraryViews,
        opened.bodyRecovery,
        opened.subscribeSourceChanges,
      ),
    [opened],
  );
  return (
    <Suspense
      fallback={
        <OpeningScreen
          app="reader"
          title="Opening your reading collection"
          detail="Preparing the reading workspace"
        />
      }
    >
      <ReaderApp
        key={opened.collectionId}
        gateway={gateway}
        initialSourceId={requestedSourceId(location.href, opened.collectionId)}
        initialAnnotation={requestedAnnotation(location.href, opened.collectionId)}
        {...(opened.directAccess ? { directAccess: opened.directAccess } : {})}
        saveFile={(name, blob) => readerPlatform.saveFile(name, blob)}
        pickSourceFile={() =>
          readerPlatform.pickFile([
            ".pdf",
            ".epub",
            ".html",
            ".htm",
            "application/pdf",
            "application/epub+zip",
            "text/html",
          ])
        }
        renderDocument={(source, onSurfaceChange) => (
          <ConnectedDocument
            repository={opened.documents}
            source={source}
            onSurfaceChange={onSurfaceChange}
          />
        )}
      />
    </Suspense>
  );
}
