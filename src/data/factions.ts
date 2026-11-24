/**
 * Factions are dnd5e `faction` actors. This module reads them as FactionDef
 * and writes back only what the faction actor stores (name, image,
 * description, category, ranks, members) plus its own flags (color, progress
 * scale, cap, rank descriptions).
 */
import { DMG_THRESHOLDS, FLAGS, MODULE_ID } from "../constants.js";
import {
  FACTION_TYPE,
  factionActors,
  factionIdentifier,
  isFactionActor,
  itemModifiers,
  renownItems,
} from "./native.js";
import { buildFactionExport, factionKey, normalizeFaction, uniqueIdentifier } from "./rules.js";
import type { FactionDef, RankDef } from "./types.js";

/** FactionDef view of a faction actor. */
export function toFactionDef(actor: any): FactionDef {
  const flags = actor.flags?.[MODULE_ID] ?? {};
  const rankFlags: Record<string, { description?: string; icon?: string }> =
    flags[FLAGS.ranks] ?? {};
  const ranks = Object.entries(actor.system?.ranks ?? {}).map(([id, rank]: [string, any]) => ({
    id,
    name: rank?.name ?? "",
    minScore: Number(rank?.renown) || 0,
    description: rankFlags[id]?.description ?? "",
    icon: rankFlags[id]?.icon ?? "",
  }));
  return normalizeFaction({
    id: actor.id,
    identifier: factionIdentifier(actor),
    name: actor.name,
    kind: actor.system?.type?.value || "faction",
    description: actor.system?.description?.full ?? "",
    img: actor.img === CONFIG.Actor?.documentClass?.DEFAULT_ICON ? "" : actor.img,
    color: flags[FLAGS.color],
    progressMax: flags[FLAGS.progressMax],
    cap: flags[FLAGS.cap],
    ranks,
  });
}

/** All faction definitions, sorted by name. */
export function getFactions(): FactionDef[] {
  return factionActors()
    .map((a) => toFactionDef(a))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

export function getFactionMap(): Map<string, FactionDef> {
  return new Map(getFactions().map((f) => [f.id, f]));
}

export function getFactionActor(id: string): any | null {
  const actor = game.actors.get(id);
  return isFactionActor(actor) ? actor : null;
}

export function getFaction(id: string): FactionDef | null {
  const actor = getFactionActor(id);
  return actor ? toFactionDef(actor) : null;
}

export function getFactionByIdentifier(identifier: string): FactionDef | null {
  const actor = factionActors().find((a) => factionIdentifier(a) === identifier);
  return actor ? toFactionDef(actor) : null;
}

function assertGM(): void {
  if (!game.user.isGM) throw new Error(`${MODULE_ID} | Only a GM can change factions.`);
}

function takenIdentifiers(): Set<string> {
  return new Set(factionActors().map((a) => factionIdentifier(a)));
}

/** Actor creation data for a faction (also used by import and migration). */
export function factionCreateData(faction: Partial<FactionDef>, identifier: string): any {
  const def = normalizeFaction({ ...faction, id: "", identifier } as FactionDef);
  const data: any = {
    name: def.name || game.i18n.localize("FACTION_STANDING.Faction.NewName"),
    type: FACTION_TYPE,
    system: {
      identifier,
      type: { value: def.kind },
      description: { full: def.description ?? "" },
      ranks: Object.fromEntries(def.ranks.map((r) => [r.id, { name: r.name, renown: r.minScore }])),
    },
    flags: { [MODULE_ID]: moduleFlags(def) },
  };
  if (def.img) data.img = def.img;
  return data;
}

function moduleFlags(def: FactionDef): Record<string, unknown> {
  return {
    [FLAGS.color]: def.color ?? "",
    [FLAGS.progressMax]: def.progressMax,
    [FLAGS.cap]: def.cap,
    [FLAGS.ranks]: Object.fromEntries(
      def.ranks.map((r) => [r.id, { description: r.description ?? "", icon: r.icon ?? "" }]),
    ),
  };
}

export async function createFaction(name?: string): Promise<FactionDef> {
  assertGM();
  const label = name ?? game.i18n.localize("FACTION_STANDING.Faction.NewName");
  const identifier = uniqueIdentifier(label, takenIdentifiers());
  const actor = await Actor.implementation.create(factionCreateData({ name: label }, identifier));
  return toFactionDef(actor);
}

/**
 * Saves a faction only if something changed (avoids re-render churn).
 * Ranks are written as a whole: removed rank ids are deleted with `_del`.
 */
export async function saveFaction(faction: FactionDef): Promise<boolean> {
  assertGM();
  const actor = getFactionActor(faction.id);
  if (!actor) return false;
  const prev = toFactionDef(actor);
  const next = normalizeFaction({ ...faction, identifier: prev.identifier });
  if (JSON.stringify(prev) === JSON.stringify(next)) return false;

  const nextIds = new Set(next.ranks.map((r) => r.id));
  const ranks: Record<string, unknown> = Object.fromEntries(
    next.ranks.map((r) => [r.id, { name: r.name, renown: r.minScore }]),
  );
  const rankFlags: Record<string, unknown> = Object.fromEntries(
    next.ranks.map((r) => [r.id, { description: r.description ?? "", icon: r.icon ?? "" }]),
  );
  for (const old of prev.ranks) {
    if (nextIds.has(old.id)) continue;
    ranks[old.id] = _del;
    rankFlags[old.id] = _del;
  }

  const update: Record<string, unknown> = {
    name: next.name || prev.name,
    "system.type.value": next.kind,
    "system.description.full": next.description ?? "",
    "system.ranks": ranks,
    [`flags.${MODULE_ID}.${FLAGS.color}`]: next.color ?? "",
    [`flags.${MODULE_ID}.${FLAGS.progressMax}`]: next.progressMax,
    [`flags.${MODULE_ID}.${FLAGS.cap}`]: next.cap,
    [`flags.${MODULE_ID}.${FLAGS.ranks}`]: rankFlags,
  };
  if (next.img !== prev.img) update.img = next.img || CONFIG.Actor?.documentClass?.DEFAULT_ICON;
  await actor.update(update);
  return true;
}

/**
 * Deletes a faction actor. The renown items this module manages for it and
 * the notes kept for it are removed too; renown items the GM made by hand stay
 * on the actors (dnd5e then lists them as an unknown faction).
 */
export async function deleteFaction(id: string): Promise<void> {
  assertGM();
  const actor = getFactionActor(id);
  if (!actor) return;
  const identifier = factionIdentifier(actor);
  const key = factionKey(id);
  for (const holder of game.actors) {
    if (holder === actor) continue;
    const managed = renownItems(holder).filter(
      (item) =>
        item.flags?.[MODULE_ID]?.[FLAGS.managedFaction] === id &&
        itemModifiers(item).every((m) => m.faction === identifier),
    );
    if (managed.length) {
      await holder.deleteEmbeddedDocuments(
        "Item",
        managed.map((i) => i.id),
      );
    }
    const relations = holder.flags?.[MODULE_ID]?.[FLAGS.relations];
    if (relations && key in relations) {
      await holder.update({ [`flags.${MODULE_ID}.${FLAGS.relations}.${key}`]: _del });
    }
  }
  await actor.delete();
}

export function newRank(minScore = 0, name = "", description = ""): RankDef {
  return { id: foundry.utils.randomID(), name, minScore, description, icon: "" };
}

/** The three benefit thresholds of the DMG 2024, pre-filled with the benefit text. */
export function dmgThresholdRanks(): RankDef[] {
  return DMG_THRESHOLDS.map((score) =>
    newRank(score, "", game.i18n.localize(`FACTION_STANDING.Benefits.DMG${score}`)),
  );
}

/** How imported factions that already exist in this world are handled. */
export type ImportMode = "overwrite" | "copy";

/** Faction a file entry matches in this world: same identifier, else same name. */
function matchingFaction(incoming: FactionDef): FactionDef | null {
  const all = getFactions();
  return (
    (incoming.identifier && all.find((f) => f.identifier === incoming.identifier)) ||
    all.find(
      (f) => f.name.localeCompare(incoming.name, undefined, { sensitivity: "base" }) === 0,
    ) ||
    null
  );
}

/** Entries from `incoming` that already exist in this world. */
export function conflictingIds(incoming: readonly FactionDef[]): string[] {
  return incoming.filter((f) => matchingFaction(f)).map((f) => f.id);
}

/**
 * Creates (or, with "overwrite", updates) faction actors from a file.
 * Rich text is cleaned the same way Foundry cleans HTML fields.
 * Returns the faction actor ids written.
 */
export async function importFactions(
  incoming: readonly FactionDef[],
  mode: ImportMode,
): Promise<string[]> {
  assertGM();
  const clean = (html?: string) => (html ? (foundry.utils.cleanHTML?.(html) ?? html) : "");
  const ids: string[] = [];
  for (const raw of incoming) {
    const faction = {
      ...raw,
      description: clean(raw.description),
      ranks: raw.ranks.map((r) => ({ ...r, description: clean(r.description) })),
    };
    const existing = matchingFaction(faction);
    if (existing && mode === "overwrite") {
      await saveFaction({ ...faction, id: existing.id, identifier: existing.identifier });
      ids.push(existing.id);
      continue;
    }
    const identifier = uniqueIdentifier(faction.identifier || faction.name, takenIdentifiers());
    const actor = await Actor.implementation.create(factionCreateData(faction, identifier));
    ids.push(actor.id);
  }
  return ids;
}

/** Downloads the given factions (all of them by default) as a JSON file. */
export function exportFactions(factions: FactionDef[] = getFactions()): void {
  const data = buildFactionExport(factions);
  const slug =
    factions.length === 1
      ? (factions[0].name || "group").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()
      : "groups";
  const date = data.exportedAt.slice(0, 10);
  downloadText(
    JSON.stringify(data, null, 2),
    "application/json",
    `${MODULE_ID}-${slug}-${date}.json`,
  );
}

/**
 * Saves text as a file. Prefers Foundry's own helper, which also works in the
 * desktop app. The fallback keeps the link out of the document: a link added
 * to the page reaches Foundry's global link handling, which opens it in a new
 * window instead of downloading it.
 */
function downloadText(text: string, type: string, filename: string): void {
  const save = foundry.utils?.saveDataToFile;
  if (typeof save === "function") {
    save(text, type, filename);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true, view: window }));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
