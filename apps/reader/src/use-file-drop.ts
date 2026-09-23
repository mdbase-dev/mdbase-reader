import { useRef, useState, type DragEvent } from "react";

export interface FileDropTarget {
  readonly active: boolean;
  readonly handlers: {
    readonly onDragEnter: (event: DragEvent) => void;
    readonly onDragOver: (event: DragEvent) => void;
    readonly onDragLeave: (event: DragEvent) => void;
    readonly onDrop: (event: DragEvent) => void;
  };
}

/** Accepts files dragged from the operating system; in-app drags carry no files. */
export function useFileDrop(onFile: (file: File) => void): FileDropTarget {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const carriesFiles = (event: DragEvent): boolean => event.dataTransfer.types.includes("Files");
  return {
    active,
    handlers: {
      onDragEnter: (event) => {
        if (carriesFiles(event)) {
          depth.current += 1;
          setActive(true);
        }
      },
      onDragOver: (event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      },
      onDragLeave: (event) => {
        if (carriesFiles(event)) {
          depth.current = Math.max(0, depth.current - 1);
          setActive(depth.current > 0);
        }
      },
      onDrop: (event) => {
        if (!carriesFiles(event)) {
          return;
        }
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        const file = event.dataTransfer.files[0];
        if (file) {
          onFile(file);
        }
      },
    },
  };
}
