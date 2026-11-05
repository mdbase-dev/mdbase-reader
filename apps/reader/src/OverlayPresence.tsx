import { useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";

import "./overlay-motion.css";

export function OverlayPresence({
  open,
  children,
}: {
  readonly open: boolean;
  readonly children: ReactNode;
}): JSX.Element | null {
  const [present, setPresent] = useState(open);
  const host = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState({ children });
  if (open && !present) {
    setPresent(true);
  }
  if (open && content.children !== children) {
    setContent({ children });
  }
  useLayoutEffect(() => {
    if (open) {
      return;
    }
    const element = host.current;
    if (!element) {
      return;
    }
    let cancelled = false;
    const animations = element
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target === element.firstElementChild,
      );
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) {
        setPresent(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  return open || present ? (
    <div ref={host} className="reader-overlay" data-state={open ? "open" : "closed"}>
      {open ? children : content.children}
    </div>
  ) : null;
}
