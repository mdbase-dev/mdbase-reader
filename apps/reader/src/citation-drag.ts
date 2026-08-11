import type { CslItem } from "@mdbase-reader/core";

export function writeCitationDrag(data: DataTransfer, citation: CslItem): void {
  data.effectAllowed = "copy";
  data.setData("text/plain", `[@${citation.id}]`);
  data.setData("text/markdown", `[@${citation.id}]`);
  data.setData("application/vnd.citationstyles.csl+json", JSON.stringify(citation));
}
