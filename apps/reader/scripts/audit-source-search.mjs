import { expect } from "@playwright/test";

export async function searchSources(page, query) {
  await page.getByRole("button", { name: /^Search and commands/u }).click();
  const search = page.getByRole("combobox", { name: "Search sources and commands", exact: true });
  await expect(search).toBeFocused();
  await search.fill(query);
}
