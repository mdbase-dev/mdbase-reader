export const SOURCE_ROW_HEIGHT = 72;
export const SOURCE_LIST_PADDING_START = 6;
export const SOURCE_LIST_PADDING_END = 12;
export const SOURCE_LIST_OVERSCAN = 5;

export interface VirtualSourceRangeInput {
  readonly itemCount: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly rowHeight?: number;
  readonly overscan?: number;
  readonly paddingStart?: number;
  readonly paddingEnd?: number;
}

export interface VirtualSourceRange {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly totalHeight: number;
}

export function virtualSourceRange({
  itemCount,
  scrollTop,
  viewportHeight,
  rowHeight = SOURCE_ROW_HEIGHT,
  overscan = SOURCE_LIST_OVERSCAN,
  paddingStart = SOURCE_LIST_PADDING_START,
  paddingEnd = SOURCE_LIST_PADDING_END,
}: VirtualSourceRangeInput): VirtualSourceRange {
  const count = Math.max(0, itemCount);
  const firstVisible = Math.max(0, Math.floor((scrollTop - paddingStart) / rowHeight));
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleCount + overscan);

  return {
    start,
    end,
    offset: paddingStart + start * rowHeight,
    totalHeight: paddingStart + count * rowHeight + paddingEnd,
  };
}

export function keyboardSourceIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (itemCount === 0) {
    return null;
  }
  switch (key) {
    case "ArrowDown":
      return Math.min(itemCount - 1, currentIndex + 1);
    case "ArrowUp":
      return Math.max(0, currentIndex - 1);
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}
