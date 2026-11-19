/**
 * Hooks into dnd5e's own faction support:
 * - fills CONFIG.DND5E.factionCategories (empty in dnd5e 6.1) with the
 *   DMG's three kinds of group, unless something else already did;
 * - adds a "Ranks & members" control to faction actor sheets (dnd5e's and
 *   Tidy's), opening this module's manager on that faction;
 * - turns dnd5e's Renown setting on, since factions and renown items only
 *   show up in the system with it enabled.
 */
import { openFactionManager } from "../apps/FactionManagerApp.js";
import { DEFAULT_KINDS, MODULE_ID } from "../constants.js";
import { isFactionActor, renownEnabled } from "../data/native.js";

export function registerFactionCategories(): void {
  const config = CONFIG.DND5E;
  if (!config) return;
  config.factionCategories ??= {};
  if (Object.keys(config.factionCategories).length) return;
  for (const kind of DEFAULT_KINDS) {
    config.factionCategories[kind] = { label: `FACTION_STANDING.Faction.Kind.${kind}` };
  }
}

export function registerFactionSheetControls(): void {
  Hooks.on("getHeaderControlsActorSheetV2", (app: any, controls: any[]) => {
    const actor = app.document ?? app.actor;
    if (!game.user.isGM || !isFactionActor(actor) || !Array.isArray(controls)) return;
    if (controls.some((c) => c.action === `${MODULE_ID}-manage`)) return;
    controls.push({
      action: `${MODULE_ID}-manage`,
      icon: "fa-solid fa-medal",
      label: "FACTION_STANDING.FactionSheet.Manage",
      onClick: () => openFactionManager(actor.id),
    });
  });
}

/** Turns on dnd5e's Renown setting (active GM only), telling the GM it did. */
export async function ensureRenownEnabled(): Promise<void> {
  if (renownEnabled() || !game.users.activeGM?.isSelf) return;
  try {
    await game.settings.set("dnd5e", "renownScore", true);
    ui.notifications.info(game.i18n.localize("FACTION_STANDING.Notify.RenownEnabled"));
  } catch (err) {
    console.warn(`${MODULE_ID} | could not enable dnd5e renown`, err);
  }
}
