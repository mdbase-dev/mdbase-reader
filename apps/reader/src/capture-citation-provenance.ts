import { cslValuesEqual, type CslProvenance } from "@mdbase-reader/core";

/** Only explain values actually saved; the locally generated citekey is not captured evidence. */
export function captureCitationProvenance(
  citation: Readonly<Record<string, unknown>>,
  provenance: CslProvenance,
): CslProvenance {
  return Object.fromEntries(
    Object.entries(provenance).filter(
      ([field, entry]) =>
        field !== "id" &&
        citation[field] !== undefined &&
        cslValuesEqual(citation[field], entry.value),
    ),
  );
}
