import { snapPanelSize } from "./workspace-shell-preferences.js";

import type { InspectorDock } from "./workspace-shell-preferences.js";
import type { JSX, PointerEvent } from "react";

export function LibraryResizeHandle({
  onResize,
}: {
  readonly onResize: (width: number) => void;
}): JSX.Element {
  return (
    <ResizeHandle
      className="library-resize-handle"
      label="Resize library"
      onPosition={(event) => onResize(snapPanelSize(event.clientX, [244, 272, 320]))}
    />
  );
}

export function InspectorResizeHandle({
  dock,
  onResize,
}: {
  readonly dock: InspectorDock;
  readonly onResize: (size: number) => void;
}): JSX.Element {
  return (
    <ResizeHandle
      className={`inspector-resize-handle is-${dock}`}
      label={`Resize ${dock === "right" ? "source workspace" : "lower workspace"}`}
      onPosition={(event) => {
        const size =
          dock === "right"
            ? globalThis.innerWidth - event.clientX
            : globalThis.innerHeight - event.clientY;
        onResize(snapPanelSize(size, dock === "right" ? [306, 340, 420] : [280, 320, 400]));
      }}
    />
  );
}

function ResizeHandle({
  className,
  label,
  onPosition,
}: {
  readonly className: string;
  readonly label: string;
  readonly onPosition: (event: globalThis.PointerEvent) => void;
}): JSX.Element {
  const start = (event: PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: globalThis.PointerEvent): void => onPosition(moveEvent);
    const finish = (): void => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", finish);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", finish);
  };
  return (
    <button
      type="button"
      className={`panel-resize-handle ${className}`}
      aria-label={label}
      onPointerDown={start}
    />
  );
}
