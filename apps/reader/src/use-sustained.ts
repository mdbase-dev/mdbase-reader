import { useEffect, useState } from "react";

/** How long a save runs before "Saving…" is worth showing. Most autosaves finish sooner. */
export const SLOW_SAVE_MS = 600;

/** True once `flag` has held for `delay` ms, so a quick flicker of work never shows. */
export function useSustained(flag: boolean, delay: number, since?: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!flag) {
      return undefined;
    }
    const remaining = since === undefined ? delay : Math.max(0, since + delay - Date.now());
    const timer = setTimeout(() => setHeld(true), remaining);
    return () => {
      clearTimeout(timer);
      setHeld(false);
    };
  }, [flag, delay, since]);
  return flag && held;
}
