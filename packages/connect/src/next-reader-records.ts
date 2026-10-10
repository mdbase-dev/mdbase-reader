import { revisionOf, type MdbaseClient, type RecordRef, type wire } from "@mdbase-dev/sdk";

import { annotationContract, sourceContract } from "./contracts.js";

/** Semantic contract digests supplied by qualified native manifest/setup inputs,
 * NOT guessed from raw Markdown resource hashes or historical starter names. */
export interface NextReaderContractDigests {
  readonly source: wire.Hash;
  readonly annotation: wire.Hash;
}

export interface NextReaderRecord {
  readonly record: wire.RecordView;
  readonly providerType: string;
  readonly fields: ReadonlyMap<string, wire.Value>;
}

type Domain = keyof NextReaderContractDigests;
type Providers = ReadonlyMap<string, ReadonlyMap<string, string>>;
const contracts = { source: sourceContract, annotation: annotationContract };
const required = {
  source: ["id", "title", "kind", "saved_at"],
  annotation: ["id", "source", "annotation_type", "created_at"],
};

/** Native read-only source/annotation foundation, not a Connect-shaped SDK
 * facade. Returns actual SDK views/tagged values, retaining native state and
 * identities. Sign-in/collection lifetime and all writes remain SDK-owned. */
export class NextReaderRecords {
  private readonly digests: NextReaderContractDigests;

  constructor(
    private readonly client: MdbaseClient,
    digests: NextReaderContractDigests,
  ) {
    for (const domain of ["source", "annotation"] as const) {
      if (!/^sha256:[0-9a-f]{64}$/.test(digests[domain])) {
        throw new Error(`Reader needs a qualified native ${domain} contract digest.`);
      }
    }
    this.digests = { ...digests };
  }

  sources(signal: AbortSignal): AsyncIterable<readonly NextReaderRecord[]> {
    return this.metadata("source", signal);
  }

  annotations(signal: AbortSignal): AsyncIterable<readonly NextReaderRecord[]> {
    return this.metadata("annotation", signal);
  }

  getSource(ref: RecordRef, signal: AbortSignal): Promise<NextReaderRecord> {
    return this.read("source", ref, signal);
  }

  getAnnotation(ref: RecordRef, signal: AbortSignal): Promise<NextReaderRecord> {
    return this.read("annotation", ref, signal);
  }

  private async providers(domain: Domain, signal: AbortSignal): Promise<Providers> {
    signal.throwIfAborted();
    const catalog = await this.client.describe(signal);
    signal.throwIfAborted();
    const expected = contracts[domain];
    const matching = catalog.contracts.filter(
      (contract) => contract.id === expected.id && contract.version === expected.version,
    );
    const contract = matching[0];
    if (
      matching.length !== 1 ||
      contract?.digest !== this.digests[domain] ||
      contract.contractType !== "record"
    ) {
      throw new Error(`This collection does not provide the qualified Reader ${domain} contract.`);
    }
    const providers = new Map<string, ReadonlyMap<string, string>>();
    for (const type of catalog.types) {
      const bindings = type.implements.filter(
        (binding) => binding.contract === expected.id && binding.version === expected.version,
      );
      if (bindings.length > 1 || providers.has(type.name)) {
        throw new Error(`The Reader ${domain} provider is ambiguous.`);
      }
      const binding = bindings[0];
      if (!binding) {
        continue;
      }
      const fields = new Map(binding.fields);
      if (required[domain].some((role) => !fields.get(role))) {
        throw new Error(`The Reader ${domain} provider lacks required field bindings.`);
      }
      if ([...fields.values()].some((field) => field.includes(".") || field.includes("["))) {
        throw new Error("This Reader binding needs shared SDK nested-field reference support.");
      }
      providers.set(type.name, fields);
    }
    if (!providers.size) {
      throw new Error(`The Reader ${domain} contract has no implementing types.`);
    }
    return providers;
  }

  private async *metadata(
    domain: Domain,
    signal: AbortSignal,
  ): AsyncIterable<readonly NextReaderRecord[]> {
    const providers = await this.providers(domain, signal);
    const identities = new Set<string>();
    let asOf: number | undefined;
    for await (const page of this.client.pages(
      { types: [...providers.keys()], limit: 1000 },
      { effective: true },
      signal,
    )) {
      signal.throwIfAborted();
      if (!page.complete) {
        throw new Error("Reader did not receive a complete native metadata page.");
      }
      if (asOf !== undefined && page.asOf !== asOf) {
        throw new Error("The Reader metadata snapshot changed between pages. Reload it.");
      }
      asOf = page.asOf;
      await this.assertProviders(domain, providers, signal);
      const records = page.records.map((record) => {
        if (identities.has(record.id)) {
          throw new Error("Reader metadata repeated a native record identity.");
        }
        identities.add(record.id);
        return project(domain, record, providers);
      });
      yield records;
    }
  }

  private async read(
    domain: Domain,
    ref: RecordRef,
    signal: AbortSignal,
  ): Promise<NextReaderRecord> {
    // Capture the selected reference before awaiting catalog I/O. Do not let a
    // caller-mutated path/UUID switch the record whose body is opened.
    const selected: RecordRef =
      typeof ref === "string" ? ref : "id" in ref ? ref.id : { path: ref.path };
    const providers = await this.providers(domain, signal);
    const record = await this.client.get(
      selected,
      { body: true, document: true, effective: true },
      signal,
    );
    signal.throwIfAborted();
    if (typeof selected === "string" ? record.id !== selected : record.path !== selected.path) {
      throw new Error("The Reader record changed its selected native identity.");
    }
    if (
      record.body === undefined ||
      record.document === undefined ||
      revisionOf(record.document) !== record.revision
    ) {
      throw new Error(
        "Reader did not receive the actual complete revision-consistent source. No source was reconstructed.",
      );
    }
    await this.assertProviders(domain, providers, signal);
    return project(domain, record, providers);
  }

  private async assertProviders(
    domain: Domain,
    captured: Providers,
    signal: AbortSignal,
  ): Promise<void> {
    const current = await this.providers(domain, signal);
    if (
      current.size !== captured.size ||
      [...captured].some(([type, fields]) => {
        const fresh = current.get(type);
        return (
          fresh?.size !== fields.size ||
          [...fields].some(([role, field]) => fresh.get(role) !== field)
        );
      })
    ) {
      throw new Error("The Reader provider bindings changed while reading. Reload the collection.");
    }
  }
}

function project(domain: Domain, record: wire.RecordView, providers: Providers): NextReaderRecord {
  const matching = record.types.filter((type) => providers.has(type));
  const providerType = matching[0];
  if (matching.length !== 1 || !providerType) {
    throw new Error("Reader cannot select a unique admitted provider for this record.");
  }
  const values = record.effective ?? record.frontmatter;
  const fields = new Map<string, wire.Value>();
  const binding = providers.get(providerType);
  if (!binding) {
    throw new Error("The Reader provider is no longer admitted.");
  }
  for (const [role, field] of binding) {
    const value = values.get(field);
    if (value !== undefined) {
      fields.set(role, value);
    }
  }
  if (required[domain].some((role) => !fields.has(role))) {
    throw new Error("The Reader record lacks required contract fields.");
  }
  return { record, providerType, fields };
}
