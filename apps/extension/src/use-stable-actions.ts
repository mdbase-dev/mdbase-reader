import { useLayoutEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any action signature is accepted.
type Actions = Record<string, (...args: any[]) => unknown>;

/** Holds the latest render's actions behind wrappers made once. */
class LatestActions<T extends Actions> {
  #actions: T;
  readonly stable: T;

  constructor(actions: T) {
    this.#actions = actions;
    this.stable = Object.fromEntries(
      Object.keys(actions).map((name) => [
        name,
        (...args: unknown[]) => this.#actions[name]?.(...args),
      ]),
    ) as T;
  }

  update(actions: T): void {
    this.#actions = actions;
  }
}

/**
 * Functions that keep their identity for the panel's lifetime but always run the latest
 * render's version, so memoised children are not redrawn by every keystroke in a draft.
 * The set of names must not change between renders; call them from events, not rendering.
 */
export function useStableActions<T extends Actions>(actions: T): T {
  const [latest] = useState(() => new LatestActions(actions));
  useLayoutEffect(() => {
    latest.update(actions);
  });
  return latest.stable;
}
