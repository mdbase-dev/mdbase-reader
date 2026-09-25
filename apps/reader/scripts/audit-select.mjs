/**
 * Chooses an option in Reader's styled Select (a combobox button whose listbox opens in the
 * top layer), the way `selectOption` does for a native select.
 */
export async function chooseOption(combobox, value) {
  await combobox.click();
  const listId = await combobox.getAttribute("aria-controls");
  await combobox.page().locator(`[id="${listId}"] [role="option"][data-value="${value}"]`).click();
}
