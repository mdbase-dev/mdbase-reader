import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "../src/reader.css";
import "../src/annotation-polish.css";
import "../src/reader-shell.css";
import { AnnotationList } from "../src/AnnotationList.js";

const count = Math.min(3000, Math.max(1, Number(new URLSearchParams(location.search).get("count")) || 300));
const annotations: Annotation[] = Array.from({ length: count }, (_, index) => ({
  id: annotationId(`scale_${String(index).padStart(4, "0")}`),
  collectionId: collectionId("annotation-scale-fixture"),
  sourceId: sourceId("scale-source"),
  source: "[[scale-source]]",
  path: `annotations/scale_${String(index)}.md`,
  recordRevision: recordRevision("fixture-1"),
  document: { fileId: fileId("scale-document"), file: "[[scale.pdf]]", revision: fileRevision(`sha256:${"a".repeat(64)}`) },
  annotationType: index % 5 === 0 ? "bookmark" : "highlight",
  locator: { label: `p. ${String(index + 1)}` },
  target: { position: { kind: "pdf", pageIndex: index } },
  body: index % 5 === 0 ? "" : `> Passage ${String(index)}: ${"Patient attention makes careful research possible. ".repeat(1 + index % 9)}\n\nComment ${String(index)}: ${"A useful connection to revisit. ".repeat(index % 4)}`,
  tags: [index % 2 ? "research" : "attention"],
  createdAt: dateTime("2026-08-09T00:00:00Z"),
}));
const resource = { status: "ready" as const, value: annotations };
const transclusion = { busyId: null, problemId: null, problem: null, isEmbedded: () => false, insert: () => undefined };
const metrics: { renderMs: number[] } = { renderMs: [] };
Object.assign(window, { scaleMetrics: metrics });

function Fixture() {
  const [mounted, setMounted] = useState(false);
  const [activeId, setActiveId] = useState<Annotation["id"] | null>(null);
  return (
    <main style={{ padding: 24 }}>
      <h1>Annotation scale fixture</h1>
      <p>Disposable, in-memory source with {count} variable-height annotations. No Connect access.</p>
      <button onClick={() => { metrics.renderMs.length = 0; setMounted(true); }}>Mount annotations</button>{" "}
      <button onClick={() => setActiveId(annotations[count - 1]!.id)}>Select last annotation</button>
      <Profiler id="annotations" onRender={(_id, _phase, duration) => { metrics.renderMs.push(duration); }}>
        <div className="annotation-workspace" style={{ width: 430, height: 640, border: "1px solid var(--line)", marginTop: 16 }}>
          {mounted ? <AnnotationList
            annotations={resource}
            transclusion={transclusion}
            activeId={activeId}
            editingId={null}
            onCancelEdit={() => undefined}
            onOpen={(annotation) => setActiveId(annotation.id)}
            onUpdate={async (annotation) => annotation}
            onPlanDelete={async () => { throw new Error("Fixture is read-only"); }}
            onDelete={async () => undefined}
            readFile={async () => { throw new Error("No attachments in this fixture"); }}
          /> : null}
        </div>
      </Profiler>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
