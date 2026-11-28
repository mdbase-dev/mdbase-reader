import {
  connect,
  decode,
  encode,
  type FramePort,
  type OpenedPort,
} from "@mdbase-dev/sdk/thin-client";
import {
  annotationFromDocument,
  ConnectAnnotationRepository,
  ConnectSourceRepository,
  sourceFromDocument,
  type Mdbase,
} from "@mdbase-reader/connect";
import {
  annotationId,
  collectionId,
  dateTime,
  fileRevision,
  mutationId,
} from "@mdbase-reader/core";

import { annotationDraftSnapshot } from "../src/annotation-drafts.js";
import { AnnotationEditSession } from "../src/annotation-edit-session.js";
import { SourceDraftSession } from "../src/source-draft-session.js";
import { readSourceDraft } from "../src/source-draft-storage.js";

import type { RecordView } from "@mdbase-dev/sdk";
import type { Annotation } from "@mdbase-reader/core";

interface OfflineFixture {
  editNotes(): Promise<void>;
  editSourceAndHighlight(): Promise<Annotation>;
  resolveNotes(): Promise<void>;
  current(): Promise<{ body: string | undefined; tags: unknown; reading: unknown }>;
  readHighlight(path: string): Promise<RecordView>;
  drafts(): {
    source: { text: string; conflict: string | undefined };
    annotation: { text: string; conflict: string | undefined };
    ready: boolean;
    sourceDraft: string | null;
    annotationDraft: string | null;
  };
}

const browser = globalThis as typeof globalThis & {
  fixtureOpenReplica(hello: number[]): Promise<{ id: number; hello: number[] }>;
  fixtureSend(id: number, frame: number[]): Promise<void>;
  fixtureReceive?: (id: number, bytes: number[]) => void;
  fixture?: OfflineFixture;
};

async function setup(): Promise<OfflineFixture> {
  const ports = new Map<number, FramePort>();
  browser.fixtureReceive = (id, bytes) => ports.get(id)?.onframe?.(decode(Uint8Array.from(bytes)));
  const client = await connect({
    connector: {
      description: "Reader browser test port",
      async open(hello): Promise<OpenedPort> {
        const response = await browser.fixtureOpenReplica([...encode(hello)]);
        const port: FramePort = {
          send: (frame) => void browser.fixtureSend(response.id, [...encode(frame)]),
          close: () => void ports.delete(response.id),
          onframe: null,
          onclose: null,
        };
        ports.set(response.id, port);
        return { port, helloResponse: decode(Uint8Array.from(response.hello)) };
      },
    },
    app: { name: "reader-offline-test", version: "1.0.0" },
    reconnect: false,
  });
  const include = { effective: true, body: true, document: true };
  const awaitReceipt = client.awaitReceipt.bind(client);
  client.awaitReceipt = (id, options) => awaitReceipt(id, { ...options, timeoutMs: 100 });
  const mdbase = {
    connection: () => ({ records: client, isCurrent: () => true }),
  } as unknown as Mdbase;
  const collection = collectionId(client.collection);
  const source = sourceFromDocument(
    collection,
    await client.get({ path: "sources/article.md" }, { include }),
  );
  const annotation = annotationFromDocument(
    collection,
    await client.get({ path: "annotations/note.md" }, { include }),
    source.id,
  );
  const note = new SourceDraftSession(mdbase, source, localStorage, () => undefined);
  const comment = new AnnotationEditSession(mdbase, annotation);
  comment.start();
  const sources = new ConnectSourceRepository(client);
  const annotations = new ConnectAnnotationRepository(client);
  return {
    async editNotes() {
      note.edit("Offline article note");
      comment.edit("Offline annotation comment");
      await Promise.all([note.save(), comment.save()]);
    },
    async editSourceAndHighlight() {
      await sources.updateFields({
        collectionId: collection,
        sourceId: source.id,
        fields: { tags: ["offline-tag"] },
      });
      await sources.updateReadingStatus({
        collectionId: collection,
        sourceId: source.id,
        status: "finished",
        changedAt: dateTime("2026-11-01T00:00:00Z"),
      });
      await sources.updateReading({
        collectionId: collection,
        sourceId: source.id,
        openedAt: dateTime("2026-11-01T00:01:00Z"),
        document: { file: "[[article.html]]", revision: fileRevision("sha256:abcdef") },
        position: { kind: "html", href: "article.html", progression: 0.6 },
      });
      return annotations.create(
        {
          ...annotation,
          id: annotationId("offline-highlight"),
          annotationType: "highlight",
          source: "[[sources/article]]",
          body: "> Long article passage.",
          target: { quote: { exact: "Long article passage." } },
        },
        mutationId("018f0000-0000-7000-8000-000000000001"),
      );
    },
    async current() {
      const article = await client.get({ path: source.path }, { include });
      return {
        body: article.body,
        tags: article.frontmatter["tags"],
        reading: article.frontmatter["reading"],
      };
    },
    async resolveNotes() {
      note.resolve("remote");
      comment.resolve("local");
      await comment.save();
    },
    readHighlight(path: string) {
      return client.get({ path }, { include });
    },
    drafts() {
      const sourceDraft = readSourceDraft(localStorage, source);
      const annotationDraft = annotationDraftSnapshot(comment.key);
      return {
        source: { text: note.getText(), conflict: note.getSnapshot().conflict?.body },
        annotation: { text: comment.getText(), conflict: comment.getSnapshot().conflict?.body },
        ready: comment.getSnapshot().status === "saved",
        sourceDraft: sourceDraft?.savedOnDevice ? sourceDraft.body : null,
        annotationDraft:
          annotationDraft.value?.savedOnDevice && annotationDraft.saved
            ? annotationDraft.value.body
            : null,
      };
    },
  };
}

browser.fixture = await setup();
