/** Faction categories, as configured in CONFIG.DND5E.factionCategories. */

/** Label of a faction category, from dnd5e's config (already localized after setup). */
export function kindLabel(kind: string): string {
  const label = CONFIG.DND5E?.factionCategories?.[kind]?.label;
  return label ? game.i18n.localize(label) : kind;
}

/** Category choices for the manager. */
export function kindOptions(
  selected: string,
): { value: string; label: string; selected: boolean }[] {
  const keys = Object.keys(CONFIG.DND5E?.factionCategories ?? {});
  if (selected && !keys.includes(selected)) keys.push(selected);
  return keys
    .map((value) => ({ value, label: kindLabel(value), selected: value === selected }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}
