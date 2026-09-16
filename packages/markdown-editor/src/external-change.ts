export interface MinimalTextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export function minimalTextChange(current: string, next: string): MinimalTextChange | null {
  if (current === next) {
    return null;
  }
  let prefix = 0;
  const limit = Math.min(current.length, next.length);
  while (prefix < limit && current[prefix] === next[prefix]) {
    prefix += 1;
  }
  let currentSuffix = current.length;
  let nextSuffix = next.length;
  while (
    currentSuffix > prefix &&
    nextSuffix > prefix &&
    current[currentSuffix - 1] === next[nextSuffix - 1]
  ) {
    currentSuffix -= 1;
    nextSuffix -= 1;
  }
  return { from: prefix, to: currentSuffix, insert: next.slice(prefix, nextSuffix) };
}
