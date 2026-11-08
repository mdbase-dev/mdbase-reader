import type { ReaderCreateFollowThrough } from "./create-follow-through.js";
import type { LibraryViewRepository } from "./library-views.js";
import type { ReaderSettingsStore } from "./reader-settings.js";
import type {
  AnnotationAssetRepository,
  AnnotationRepository,
  BodyUpdateRecovery,
  CollectionFileRepository,
  CollectionId,
  ContentSearchRepository,
  DocumentRepository,
  SourceImportRepository,
  SourceRepository,
} from "@mdbase-reader/core";
import type { MigrationTarget } from "@mdbase-reader/migration";

/** Anything that can hand Reader its currently opened collection. */
export interface ReaderCollectionProvider {
  connectedCollection(): ReaderConnectedCollection | null;
}

export interface ReaderConnectedCollection {
  readonly collectionId: CollectionId;
  readonly collectionName: string;
  readonly sources: SourceRepository;
  readonly sourceImports: SourceImportRepository;
  readonly migration: MigrationTarget;
  readonly annotations: AnnotationRepository;
  readonly annotationAssets: AnnotationAssetRepository;
  readonly documents: DocumentRepository;
  readonly contentSearch: ContentSearchRepository;
  readonly files: CollectionFileRepository;
  readonly libraryViews: LibraryViewRepository;
  /**
   * Reader's collection-wide settings record, `_settings/dev.mdbase.reader.md`, whose name
   * templates this collection's creates use. Absent in test doubles.
   */
  readonly settings?: ReaderSettingsStore;
  /**
   * Calls `listener` when the source list may have changed outside this
   * workspace's own writes: another tab, app or device added, edited or
   * removed a source, or the change feed reset. Absent for Connect collections.
   */
  readonly subscribeSourceChanges?: (listener: () => void) => () => void;
  readonly bodyRecovery: BodyUpdateRecovery;
  /**
   * Record creates kept on this device until the collection confirms them, and the ones
   * that need the user. Absent when creates are decided before they return (Connect).
   */
  readonly createFollowThrough?: ReaderCreateFollowThrough;
}
