// mdbase-next backend: the one place Reader talks to the control plane.
//
// DEPENDENCY (control workstream): neither the consent flow that registers this
// client's key (`client_pk`) in a grant nor the routing endpoint exists yet. The
// HTTP implementation below targets a *proposed* endpoint and must follow the
// control workstream's final contract.
import { mdbaseError, type RelayRoute } from "@mdbase-dev/sdk";

/** A grant this client's key holds for one collection. */
export interface ReaderNextGrant {
  readonly collectionId: string;
  readonly grant: string;
  readonly displayName: string;
}

export interface ReaderNextControlPlane {
  /** The grants registered for this client key. */
  grants(clientPublicKey: Uint8Array): Promise<readonly ReaderNextGrant[]>;
  /**
   * Ask the person to consent. Consent registers `clientPublicKey` as the grant's
   * `client_pk`. Resolves `null` when no grant was made.
   */
  authorize(clientPublicKey: Uint8Array): Promise<ReaderNextGrant | null>;
  /**
   * Where the collection's replica can be reached now. `null` means no target is
   * online: for a private collection, none of the person's devices.
   */
  resolveRoute(collectionId: string): Promise<RelayRoute | null>;
}

export const nextGrantsStorageKey = "mdbase-reader:next-grants";

export interface ProposedControlPlaneOptions {
  readonly serverUrl: string;
  /** Where grants made out of band are remembered until a consent flow exists. */
  readonly storage?: Storage | null;
  readonly fetch?: typeof fetch;
}

/**
 * PROPOSED control-plane client.
 * - Route: `GET {serverUrl}/v1/next/collections/:id/route` →
 *   `{targets: [{url, device, noise_pk}]}` (`noise_pk` base64 or base64url, 32 bytes).
 * - Grants: read from local storage. The consent flow that registers `client_pk`
 *   is not defined yet, so `authorize` makes no grant.
 */
export class ProposedHttpControlPlane implements ReaderNextControlPlane {
  readonly #serverUrl: string;
  readonly #storage: Storage | null;
  readonly #fetch: typeof fetch;

  public constructor(options: ProposedControlPlaneOptions) {
    this.#serverUrl = options.serverUrl.replace(/\/+$/u, "");
    this.#storage = options.storage ?? null;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  public grants(): Promise<readonly ReaderNextGrant[]> {
    return Promise.resolve(parseGrants(this.#storage?.getItem(nextGrantsStorageKey) ?? null));
  }

  public authorize(): Promise<ReaderNextGrant | null> {
    return Promise.resolve(null);
  }

  /** Remembers a grant made out of band (for example by a development consent tool). */
  public rememberGrant(grant: ReaderNextGrant): void {
    const grants = parseGrants(this.#storage?.getItem(nextGrantsStorageKey) ?? null).filter(
      (known) => known.collectionId !== grant.collectionId,
    );
    this.#storage?.setItem(nextGrantsStorageKey, JSON.stringify([...grants, grant]));
  }

  public async resolveRoute(collectionId: string): Promise<RelayRoute | null> {
    const url = `${this.#serverUrl}/v1/next/collections/${encodeURIComponent(collectionId)}/route`;
    let response: Response;
    try {
      response = await this.#fetch(url, { credentials: "include" });
    } catch (error) {
      throw mdbaseError("unavailable", `control plane unreachable: ${String(error)}`, "no_route");
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw mdbaseError(
        "unavailable",
        `route lookup failed: ${String(response.status)}`,
        "no_route",
      );
    }
    return routeFrom(await response.json());
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

/** The first target of a route response, or `null` when none is online. */
export function routeFrom(body: unknown): RelayRoute | null {
  const targets = record(body)?.["targets"];
  if (!Array.isArray(targets)) {
    throw mdbaseError("unavailable", "malformed route response", "no_route");
  }
  for (const candidate of targets) {
    const target = record(candidate);
    const url = target?.["url"];
    const device = target?.["device"];
    const key = target?.["noise_pk"];
    if (typeof url === "string" && typeof device === "string" && typeof key === "string") {
      const noisePublicKey = base64Bytes(key);
      if (noisePublicKey.length === 32) {
        return { url, targetDevice: device, noisePublicKey };
      }
    }
  }
  return null;
}

function base64Bytes(text: string): Uint8Array {
  const normalized = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function parseGrants(text: string | null): ReaderNextGrant[] {
  if (!text) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((candidate: unknown) => {
    const grant = record(candidate);
    const collectionId = grant?.["collectionId"];
    const id = grant?.["grant"];
    const displayName = grant?.["displayName"];
    return typeof collectionId === "string" && typeof id === "string"
      ? [
          {
            collectionId,
            grant: id,
            displayName: typeof displayName === "string" ? displayName : collectionId,
          },
        ]
      : [];
  });
}
