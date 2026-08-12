export interface TabContextMenuPosition {
  readonly x: number;
  readonly y: number;
  readonly opensUpward: boolean;
}

export function tabContextMenuPosition(
  x: number,
  y: number,
  viewportHeight: number,
): TabContextMenuPosition {
  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    opensUpward: y > viewportHeight / 2,
  };
}
