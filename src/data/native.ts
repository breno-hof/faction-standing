/**
 * Thin accessors for the dnd5e 6.1 renown data model, so the rest of the
 * module never reaches into `system` paths directly.
 *
 * - Factions are `faction` actors; renown items point to them by identifier.
 * - An actor's score with a faction is the sum of its renown items' modifiers.
 * - Faction members are `system.members` entries ({ uuid, rank, role }).
 */
import type { RenownModifier } from "./rules.js";

export const FACTION_TYPE = "faction";
export const RENOWN_ITEM_TYPE = "renown";

export function isFactionActor(actor: any): boolean {
  return actor?.type === FACTION_TYPE;
}

/** World faction actors (compendium factions are not part of the world's renown). */
export function factionActors(): any[] {
  return Array.from(game.actors as Iterable<any>).filter((a: any) => isFactionActor(a));
}

/** The identifier renown items use: `system.identifier`, as dnd5e fills it on creation. */
export function factionIdentifier(faction: any): string {
  return String(faction?.system?.identifier || faction?.identifier || "");
}

export function renownItems(actor: any): any[] {
  const typed = actor?.itemTypes?.[RENOWN_ITEM_TYPE];
  if (Array.isArray(typed)) return typed;
  return Array.from(actor?.items ?? []).filter((i: any) => i?.type === RENOWN_ITEM_TYPE);
}

export function itemModifiers(item: any): RenownModifier[] {
  const raw: any[] = Array.from(item?.system?.modifiers ?? []);
  return raw
    .filter((m) => m && typeof m.faction === "string" && m.faction)
    .map((m) => ({ faction: m.faction, value: Number(m.value) || 0 }));
}

export function memberEntries(faction: any): { uuid: string; rank?: string; role?: string }[] {
  return Array.from(faction?.system?.members ?? []).filter((m: any) => m?.uuid) as any[];
}

export function memberUuids(faction: any): Set<string> {
  return new Set(memberEntries(faction).map((m) => m.uuid));
}

/** dnd5e only lets creatures (characters, NPCs) be faction members. */
export function canBeNativeMember(actor: any): boolean {
  return actor?.type === "character" || actor?.type === "npc";
}

/** dnd5e's world setting that turns renown (faction actors, renown items, the Renown tab) on. */
export function renownEnabled(): boolean {
  try {
    return !!game.settings.get("dnd5e", "renownScore");
  } catch {
    return false;
  }
}
