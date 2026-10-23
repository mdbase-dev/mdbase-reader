import { useEffect, useRef, useState, type RefObject } from "react";

/** Native Find is retained; materializing all results is an explicit, reversible expensive mode. */
export function useAnnotationBrowserFind(): {
  readonly renderAll: boolean;
  readonly setRenderAll: (value: boolean) => void;
  readonly browserRef: RefObject<HTMLDivElement | null>;
} {
  const [renderAll, setRenderAll] = useState(false);
  const browserRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onFind = (event: KeyboardEvent): void => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        browserRef.current?.contains(document.activeElement)
      ) {
        setRenderAll(true);
      }
    };
    document.addEventListener("keydown", onFind);
    return () => document.removeEventListener("keydown", onFind);
  }, []);
  return { renderAll, setRenderAll, browserRef };
}
