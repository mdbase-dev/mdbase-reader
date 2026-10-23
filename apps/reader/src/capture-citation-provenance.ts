import { cslValuesEqual, preserveCslDismissals, type CslProvenance } from "@mdbase-reader/core";

/** Filter capture evidence to saved values, but retain user dismissals even on empty fields. */
export function captureCitationProvenance(
  citation: Readonly<Record<string, unknown>>,
  provenance: CslProvenance,
): CslProvenance {
  return preserveCslDismissals(
    Object.fromEntries(
      Object.entries(provenance).filter(
        ([field, entry]) =>
          field !== "id" &&
          citation[field] !== undefined &&
          cslValuesEqual(citation[field], entry.value),
      ),
    ),
    provenance,
  );
}
