import { useMemo, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    const media = window.matchMedia(query);
    return {
      subscribe: (listener: () => void): (() => void) => {
        media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      },
      getSnapshot: () => media.matches,
    };
  }, [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
