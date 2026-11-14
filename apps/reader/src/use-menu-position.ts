import { useLayoutEffect, useState, type RefObject } from "react";

type MenuTarget = RefObject<HTMLElement | null> | { readonly x: number; readonly y: number };

export function useMenuPosition(
  ref: RefObject<HTMLDivElement | null>,
  target: MenuTarget | null,
  align: "start" | "end" = "start",
): { readonly x: number; readonly y: number } {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu || !target) {
      return;
    }
    const place = (): void => {
      const anchor = "current" in target ? target.current?.getBoundingClientRect() : null;
      const { width, height } = menu.getBoundingClientRect();
      const left = anchor ? (align === "end" ? anchor.right - width : anchor.left) : 0;
      const x = "x" in target ? target.x : left;
      const below = "y" in target ? target.y : (anchor?.bottom ?? 0) + 6;
      const above = "y" in target ? target.y : (anchor?.top ?? 0) - 6;
      const y = below + height > window.innerHeight - 8 ? above - height : below;
      setPosition({
        x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    if ("current" in target && target.current) {
      observer.observe(target.current);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [align, ref, target]);
  return position;
}
