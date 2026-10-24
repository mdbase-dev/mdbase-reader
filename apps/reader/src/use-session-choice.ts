import { useCallback, useState } from "react";

const prefix = "mdbase-reader.session.";

/** Reads a remembered choice; storage can be absent or blocked, which only loses the memory. */
export function readSessionChoice<Value extends string>(
  key: string,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  try {
    const stored = globalThis.sessionStorage.getItem(prefix + key);
    return allowed.find((value) => value === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSessionChoice(key: string, value: string): void {
  try {
    globalThis.sessionStorage.setItem(prefix + key, value);
  } catch {
    // Storage is a convenience here: the choice still applies until the panel closes.
  }
}

/** A small UI choice (a style, an open disclosure) remembered for the browser session. */
export function useSessionChoice<Value extends string>(
  key: string,
  allowed: readonly Value[],
  fallback: Value,
): readonly [Value, (value: Value) => void] {
  const [value, setValue] = useState(() => readSessionChoice(key, allowed, fallback));
  const choose = useCallback(
    (next: Value) => {
      setValue(next);
      writeSessionChoice(key, next);
    },
    [key],
  );
  return [value, choose];
}

const disclosureStates = ["open", "closed"] as const;

/** `open` and `onToggle` for a `<details>` element, collapsed until opened in this session. */
export function useSessionDisclosure(key: string): {
  readonly open: boolean;
  readonly onToggle: (event: { readonly currentTarget: HTMLDetailsElement }) => void;
} {
  const [state, setState] = useSessionChoice(`disclosure.${key}`, disclosureStates, "closed");
  return {
    open: state === "open",
    onToggle: (event) => setState(event.currentTarget.open ? "open" : "closed"),
  };
}
