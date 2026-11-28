// Store one position per non-overlapping triple of UTF-16 code units. Hash
// collisions only add candidates: startsWith verifies every returned offset.
const bucketCount = 8192;
function bucketAt(text: string, offset: number): number {
  return (
    (text.charCodeAt(offset) * 961 +
      text.charCodeAt(offset + 1) * 31 +
      text.charCodeAt(offset + 2)) &
    (bucketCount - 1)
  );
}

/** Equivalent to text.indexOf for repeated literal searches in the same text. */
// Bucket hashes and one-based slots below are always within these typed arrays.
/* eslint-disable @typescript-eslint/no-non-null-assertion */
export function indexedSubstringSearch(text: string): (needle: string) => number {
  const heads = new Uint32Array(bucketCount);
  const counts = new Uint32Array(bucketCount);
  const next = new Uint32Array(Math.floor(text.length / 3) + 1);
  // One-based slots leave zero as the end of each ascending list.
  for (let slot = next.length - 1; slot > 0; slot--) {
    const bucket = bucketAt(text, (slot - 1) * 3);
    next[slot] = heads[bucket]!;
    heads[bucket] = slot;
    counts[bucket] = counts[bucket]! + 1;
  }
  return (needle) => {
    if (needle.length < 5 || needle.length > text.length) {
      return text.indexOf(needle);
    }
    let earliest = text.length;
    // Every possible start aligns with one of these three offsets in the needle.
    for (let phase = 0; phase < 3; phase++) {
      let anchor = phase;
      let bucket = bucketAt(needle, phase);
      for (let offset = phase + 3; offset + 2 < needle.length; offset += 3) {
        const candidate = bucketAt(needle, offset);
        if (counts[candidate]! < counts[bucket]!) {
          anchor = offset;
          bucket = candidate;
        }
      }
      // A common triple provides little discrimination, especially in long quotes.
      if (counts[bucket]! * needle.length > text.length) {
        return text.indexOf(needle);
      }
      for (let slot = heads[bucket]!; slot; slot = next[slot]!) {
        const start = (slot - 1) * 3 - anchor;
        if (start >= earliest) {
          break;
        }
        if (start >= 0 && text.startsWith(needle, start)) {
          earliest = start;
          break;
        }
      }
    }
    return earliest === text.length ? -1 : earliest;
  };
}
