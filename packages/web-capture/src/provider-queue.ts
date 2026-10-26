export interface ProviderQueueOptions {
  readonly concurrency?: number;
  /** Milliseconds since the epoch, also used to interpret HTTP-date Retry-After headers. */
  readonly now?: () => number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export interface ProviderQueue {
  /** FIFO per host. remainingMs gives queued entries a deadline for cooldown admission. */
  run(
    url: string,
    request: () => Promise<Response>,
    signal?: AbortSignal,
    remainingMs?: number,
  ): Promise<Response>;
  /** How long new requests to the URL's host will wait before starting; 0 when not paused. */
  cooldownMs(url: string): number;
}

interface PendingRequest {
  readonly request: () => Promise<Response>;
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
  readonly deadline?: number;
}

interface HostQueue {
  readonly pending: PendingRequest[];
  active: number;
  pausedUntil: number;
  rateLimits: number;
  timer?: ReturnType<typeof globalThis.setTimeout>;
}

const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** A provider's Retry-After pauses its host for at most this long; lookups are optional. */
export const MAX_RETRY_AFTER_MS = 10 * 60_000;

/** The host cooldown cannot fit within this optional lookup's remaining budget. */
export class ProviderCooldownError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Provider is cooling down");
    this.name = "ProviderCooldownError";
  }
}
const MAX_TIMER_MS = 2_147_483_647;

/** Seconds or an HTTP date; missing, malformed and non-finite values have no duration. */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  const duration = /^\d+(?:\.\d+)?$/u.test(text) ? Number(text) * 1_000 : Date.parse(text) - now;
  return Number.isFinite(duration) ? Math.max(0, duration) : undefined;
}

/** Shares politeness across all requests to a host, not just requests for the same URL. */
export function createProviderQueue(options: ProviderQueueOptions = {}): ProviderQueue {
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Provider concurrency must be a positive integer.");
  }
  const now = options.now ?? Date.now;
  const schedule = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancel = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  const hosts = new Map<string, HostQueue>();

  function drain(host: HostQueue): void {
    if (host.timer !== undefined) {
      cancel(host.timer);
      delete host.timer;
    }
    const clock = now();
    const delay = host.pausedUntil - clock;
    // A new 429 applies host-wide, including entries already waiting for a slot.
    for (let index = host.pending.length - 1; index >= 0; index--) {
      const pending = host.pending[index];
      if (
        pending &&
        delay > 0 &&
        pending.deadline !== undefined &&
        host.pausedUntil >= pending.deadline
      ) {
        host.pending.splice(index, 1);
        pending.signal?.removeEventListener("abort", pending.abort);
        pending.reject(new ProviderCooldownError(delay));
      }
    }
    if (!host.pending.length || host.active >= concurrency) {
      return;
    }
    if (delay > 0) {
      host.timer = schedule(() => drain(host), Math.min(delay, MAX_TIMER_MS));
      return;
    }
    while (host.active < concurrency && host.pending.length) {
      const next = host.pending.shift();
      if (next) {
        start(host, next);
      }
    }
  }

  function observe(host: HostQueue, response: Response): void {
    if (response.status === 429) {
      const backoff = Math.min(INITIAL_BACKOFF_MS * 2 ** host.rateLimits, MAX_BACKOFF_MS);
      host.rateLimits = Math.min(host.rateLimits + 1, 4);
      const delay = Math.min(
        retryAfterMs(response.headers.get("Retry-After"), now()) ?? backoff,
        MAX_RETRY_AFTER_MS,
      );
      host.pausedUntil = Math.max(host.pausedUntil, now() + delay);
      drain(host);
    } else if (response.ok && now() >= host.pausedUntil) {
      host.rateLimits = 0;
    }
  }

  function start(host: HostQueue, pending: PendingRequest): void {
    pending.signal?.removeEventListener("abort", pending.abort);
    host.active++;
    void Promise.resolve()
      .then(() => {
        pending.signal?.throwIfAborted();
        return pending.request();
      })
      .then((response) => {
        observe(host, response);
        pending.resolve(response);
      }, pending.reject)
      .finally(() => {
        host.active--;
        drain(host);
      });
  }

  return {
    cooldownMs(url): number {
      const host = hosts.get(new URL(url).host);
      return host ? Math.max(0, host.pausedUntil - now()) : 0;
    },
    run(url, request, signal, remainingMs): Promise<Response> {
      return new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const key = new URL(url).host;
        const host = hosts.get(key) ?? { pending: [], active: 0, pausedUntil: 0, rateLimits: 0 };
        hosts.set(key, host);
        const pending: PendingRequest = {
          request,
          resolve,
          reject,
          ...(signal ? { signal } : {}),
          ...(remainingMs !== undefined ? { deadline: now() + remainingMs } : {}),
          abort: () => {
            const index = host.pending.indexOf(pending);
            if (index !== -1) {
              host.pending.splice(index, 1);
              reject(signal?.reason as Error);
              drain(host);
            }
          },
        };
        host.pending.push(pending);
        signal?.addEventListener("abort", pending.abort, { once: true });
        drain(host);
      });
    },
  };
}
