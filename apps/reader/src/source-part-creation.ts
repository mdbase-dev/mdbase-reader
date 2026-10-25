import {
  authorYearFromCsl,
  sourceId,
  sourceNotePaths,
  validateCslItem,
  type DocumentDescriptor,
  type DocumentRange,
  type PlannedSourcePart,
  type Source,
  type SourceSummary,
} from "@mdbase-reader/core";
import {
  parentCitationClaims,
  resolveCitation,
  type Claim,
} from "@mdbase-reader/web-capture/citation-updates";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";

export interface ChapterProposal {
  readonly key: string;
  readonly title: string;
  readonly level: number;
  readonly range?: DocumentRange;
  readonly problem?: string;
  readonly warning?: string;
}

/** Next peer (selected or not), or the enclosing section's end. Endpoints are inclusive. */
export function pdfChapterProposals(
  entries: readonly {
    readonly title: string;
    readonly level: number;
    readonly pageIndex?: number;
  }[],
  pageCount: number,
): readonly ChapterProposal[] {
  const next = outlinePeers(entries);
  return entries.map((entry, index) => {
    const start = entry.pageIndex;
    const peerIndex = next[index];
    const peer = peerIndex === undefined ? undefined : entries[peerIndex];
    const end = peer ? (peer.pageIndex ?? NaN) - 1 : pageCount - 1;
    const valid =
      typeof start === "number" &&
      Number.isSafeInteger(start) &&
      start >= 0 &&
      start < pageCount &&
      Number.isSafeInteger(end) &&
      end >= start &&
      end < pageCount;
    return {
      key: crypto.randomUUID(),
      title: entry.title,
      level: entry.level,
      ...(valid
        ? { range: { kind: "pages" as const, start, end } }
        : {
            problem:
              "The table of contents does not give clear start and end pages. Enter them below.",
          }),
      ...((entries[index + 1]?.level ?? -1) > entry.level
        ? {
            warning:
              "Includes nested sections. Selecting those too means the chapters will share pages.",
          }
        : {}),
    };
  });
}

export function epubChapterProposals(
  entries: readonly {
    readonly title: string;
    readonly level: number;
    readonly href: string;
    readonly fragment?: string;
  }[],
  spine: readonly string[],
): readonly ChapterProposal[] {
  const peers = outlinePeers(entries);
  const positions = new Map(spine.map((href, index) => [href, index]));
  return entries.map((entry, index) => {
    const start = positions.get(entry.href) ?? -1;
    const peerIndex = peers[index];
    const peer = peerIndex === undefined ? undefined : entries[peerIndex];
    const end = peer ? (positions.get(peer.href) ?? -1) - 1 : spine.length - 1;
    const endHref = spine[end];
    return {
      key: crypto.randomUUID(),
      title: entry.title,
      level: entry.level,
      ...(start >= 0 && end >= start && endHref
        ? { range: { kind: "epub-spine" as const, start: entry.href, end: endHref } }
        : {
            problem:
              "The table of contents does not give clear start and end sections. Choose them below.",
          }),
      ...(entry.fragment || peer?.fragment
        ? {
            warning:
              "A heading starts partway through a section. The whole section will be included; check the start and end sections.",
          }
        : {}),
    };
  });
}

/** Linear nearest-peer scan, including unselected and invalid destinations. */
function outlinePeers(
  entries: readonly { readonly level: number }[],
): readonly (number | undefined)[] {
  const peers: number[] = [];
  const next: (number | undefined)[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    while (peers.length) {
      const last = peers.at(-1);
      if (last === undefined || (entries[last]?.level ?? -1) <= entry.level) {
        break;
      }
      peers.pop();
    }
    next[i] = peers.at(-1);
    peers.push(i);
  }
  return next;
}

export function chapterCitation(
  parent: Pick<Source, "citation" | "cslProvenance">,
  title: string,
  claims: readonly Claim[] = [],
): ReturnType<typeof resolveCitation> {
  return resolveCitation({
    claims: [
      ...claims,
      ...parentCitationClaims(
        parent.citation ?? {},
        parent.cslProvenance,
        new Date().toISOString(),
      ),
      {
        field: "title",
        value: title.trim(),
        source: { kind: "user" },
        observedAt: new Date().toISOString(),
      },
      {
        field: "type",
        value: "chapter",
        source: { kind: "user" },
        observedAt: new Date().toISOString(),
      },
    ],
  });
}

export function chapterPlan(
  parent: Source,
  proposal: ChapterProposal,
  document?: DocumentDescriptor,
  claims: readonly Claim[] = [],
): PlannedSourcePart {
  const id = sourceId(`src_${proposal.key}`);
  const resolution = chapterCitation(parent, proposal.title, claims);
  const title = proposal.title.trim();
  // A chapter is named like any other source; its author and year tell apart the many
  // chapters called "Introduction".
  const recordPathCandidates = sourceNotePaths({
    title,
    id,
    authorYear: authorYearFromCsl(resolution.citation ?? {}),
  });
  return {
    collectionId: parent.collectionId,
    sourceId: id,
    recordPath: recordPathCandidates[0] ?? `sources/${id}.md`,
    recordPathCandidates,
    title,
    parent,
    ...(document && proposal.range
      ? { document: { ...document, role: "primary", range: proposal.range } }
      : {}),
    citation: { ...resolution.citation, id },
    provenance: resolution.provenance,
  };
}

export function partConflicts(
  plan: PlannedSourcePart,
  sources: readonly SourceSummary[],
  spine: readonly string[] = [],
): readonly string[] {
  return sources.flatMap((source) => {
    if (source.id === plan.sourceId) {
      return [];
    }
    const doi = plan.citation["DOI"];
    if (
      typeof doi === "string" &&
      source.citation?.["DOI"]?.toString().toLowerCase() === doi.toLowerCase()
    ) {
      return [`Duplicate DOI: ${source.title}`];
    }
    if (source.partOf !== plan.parent.id || !plan.document?.range) {
      return [];
    }
    return source.documents.flatMap((document) => {
      const a = plan.document?.range;
      const b = document.range;
      if (
        document.fileId !== plan.document?.fileId ||
        document.revision !== plan.document.revision ||
        !a ||
        !b
      ) {
        return [];
      }
      const comparison = comparePartRanges(a, b, spine);
      return comparison === "duplicate"
        ? [`Duplicate range: ${source.title}`]
        : comparison === "overlap"
          ? [`Overlaps ${source.title}`]
          : [];
    });
  });
}

// Compare endpoints only within the exact representation, using spine order rather than href text.
// eslint-disable-next-line complexity
function comparePartRanges(
  a: DocumentRange,
  b: DocumentRange,
  spine: readonly string[],
): "duplicate" | "overlap" | undefined {
  if (a.kind !== b.kind) {
    return undefined;
  }
  if (a.start === b.start && a.end === b.end) {
    return "duplicate";
  }
  if (a.kind === "pages" && b.kind === "pages") {
    return a.start <= b.end && b.start <= a.end ? "overlap" : undefined;
  }
  if (a.kind === "epub-spine" && b.kind === "epub-spine") {
    const [aStart, aEnd, bStart, bEnd] = [a.start, a.end, b.start, b.end].map((href) =>
      spine.indexOf(href),
    );
    if (aStart === undefined || aEnd === undefined || bStart === undefined || bEnd === undefined) {
      return undefined;
    }
    if (Math.min(aStart, aEnd, bStart, bEnd) < 0) {
      return undefined;
    }
    return aStart <= bEnd && bStart <= aEnd ? "overlap" : undefined;
  }
  return undefined;
}

/** Called only by explicit confirmation. Stable plan identities make partial retries resumable. */
export async function confirmChapterPlans(
  gateway: ReaderWorkspaceGateway,
  plans: readonly PlannedSourcePart[],
  acknowledged: boolean,
  onCreated: (source: Source) => void,
  spine: readonly string[] = [],
): Promise<void> {
  if (!gateway.createSourcePart) {
    throw new Error("Chapter creation is unavailable.");
  }
  const library = await gateway.library();
  if (library.sourceIndex?.complete === false) {
    throw new Error(
      "The library is still loading. Wait for it to finish so duplicate chapters can be checked.",
    );
  }
  const previous: SourceSummary[] = [...library.sources];
  const warnings: string[] = [];
  for (const plan of plans) {
    if (!plan.title.trim()) {
      throw new Error("Enter a chapter title.");
    }
    const citation = validateCslItem(plan.citation);
    if (!citation.valid) {
      throw new Error("Invalid chapter citation. Review its fields before creating sources.");
    }
    const conflicts = partConflicts(plan, previous, spine);
    if (conflicts.some((message) => message.startsWith("Duplicate"))) {
      throw new Error(conflicts.join("; "));
    }
    warnings.push(...conflicts);
    previous.push({
      ...plan.parent,
      id: plan.sourceId,
      title: plan.title,
      partOf: plan.parent.id,
      documents: plan.document ? [plan.document] : [],
      citation: citation.item,
    });
  }
  if (warnings.length && !acknowledged) {
    throw new Error(
      `${warnings.join("; ")}. Check the shared pages or sections, then tick the confirmation box to continue.`,
    );
  }
  for (const [index, plan] of plans.entries()) {
    try {
      onCreated(await gateway.createSourcePart(plan));
    } catch (error) {
      throw new Error(
        `${String(index)} of ${String(plans.length)} chapters created. You can retry without creating duplicates. ${error instanceof Error ? error.message : "Could not create the chapter."}`,
      );
    }
  }
}
