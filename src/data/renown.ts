/**
 * Renown relations of an actor, read from dnd5e data and this module's flags:
 *
 * - faction score = sum of the actor's renown items for the faction identifier
 *   (exactly what dnd5e shows on its Renown tab);
 * - faction membership = the faction actor's `system.members` (characters and
 *   NPCs); the party (group) actor cannot be a dnd5e member, so it keeps a flag;
 * - notes and individual NPC relations = flags on the actor.
 *
 * Score changes made here go into one renown item per actor and faction,
 * named after the faction and marked with this module's flag. Renown items
 * the GM adds by hand keep counting toward the total.
 */
import { FLAGS, MODULE_ID, SCORE_HOLDER_TYPES } from "../constants.js";
import { getFaction, getFactionActor } from "./factions.js";
import {
  canBeNativeMember,
  factionActors,
  factionIdentifier,
  itemModifiers,
  memberEntries,
  memberUuids,
  RENOWN_ITEM_TYPE,
  renownItems,
} from "./native.js";
import {
  clampScore,
  factionKey,
  idFromKey,
  isFactionKey,
  isNpcKey,
  renownTotal,
  withModifierDelta,
} from "./rules.js";
import type { FactionDef, RelationEntry, RelationKey, Relations } from "./types.js";

export function isScoreHolder(actor: any): boolean {
  return (SCORE_HOLDER_TYPES as readonly string[]).includes(actor?.type);
}

export function isNpc(actor: any): boolean {
  return actor?.type === "npc";
}

type FlagEntry = { score?: number; member?: boolean; notes?: string };

function flagRelations(actor: any): Record<string, FlagEntry> {
  const raw = actor?.getFlag?.(MODULE_ID, FLAGS.relations);
  return raw && typeof raw === "object" ? (raw as Record<string, FlagEntry>) : {};
}

export function getRelations(actor: any): Relations {
  const flagged = flagRelations(actor);
  const out: Relations = {};

  for (const [key, entry] of Object.entries(flagged)) {
    if (!isNpcKey(key) || !entry || typeof entry !== "object") continue;
    out[key] = {
      score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0,
      member: false,
      notes: entry.notes ?? "",
    };
  }
  if (!isScoreHolder(actor)) return out;

  const items = renownItems(actor).map((item) => ({ modifiers: itemModifiers(item) }));
  const native = canBeNativeMember(actor);
  for (const faction of factionActors()) {
    const identifier = factionIdentifier(faction);
    const key = factionKey(faction.id);
    const flag = flagged[key];
    const referenced = items.some((i) => i.modifiers.some((m) => m.faction === identifier));
    const member = native ? memberUuids(faction).has(actor.uuid) : !!flag?.member;
    if (!referenced && !member && !flag) continue;
    out[key] = { score: renownTotal(items, identifier), member, notes: flag?.notes ?? "" };
  }
  return out;
}

/** Faction actor ids an NPC (base or token actor) is a member of. */
export function getNpcFactionIds(actor: any): string[] {
  if (!actor) return [];
  const uuids = new Set<string>([actor.uuid]);
  if (actor.isToken) {
    const base = actor.token?.baseActor ?? game.actors.get(actor.token?.actorId);
    if (base?.uuid) uuids.add(base.uuid);
  }
  return factionActors()
    .filter((f) => [...memberUuids(f)].some((uuid) => uuids.has(uuid)))
    .map((f) => f.id);
}

function assertGM(): void {
  if (!game.user.isGM) throw new Error(`${MODULE_ID} | Only a GM can change renown.`);
}

function requireFaction(key: RelationKey): FactionDef {
  const faction = getFaction(idFromKey(key));
  if (!faction) throw new Error(`${MODULE_ID} | Unknown faction ${key}.`);
  return faction;
}

/** The renown item this module keeps for `actor` and `factionId`, if any. */
export function managedItem(actor: any, factionId: string): any | null {
  return (
    renownItems(actor).find(
      (item) => item.flags?.[MODULE_ID]?.[FLAGS.managedFaction] === factionId,
    ) ?? null
  );
}

export function managedItemData(faction: FactionDef, value: number): any {
  const data: any = {
    name: game.i18n.format("FACTION_STANDING.Item.Name", { faction: faction.name }),
    type: RENOWN_ITEM_TYPE,
    system: { modifiers: [{ faction: faction.identifier, value }] },
    flags: { [MODULE_ID]: { [FLAGS.managedFaction]: faction.id } },
  };
  if (faction.img) data.img = faction.img;
  return data;
}

/** Adds `delta` to the managed item (creating it, even at 0, so the relation exists). */
async function addRenown(actor: any, faction: FactionDef, delta: number): Promise<void> {
  const item = managedItem(actor, faction.id);
  if (item) {
    if (!delta) return;
    await item.update({
      "system.modifiers": withModifierDelta(itemModifiers(item), faction.identifier, delta),
    });
    return;
  }
  await actor.createEmbeddedDocuments("Item", [managedItemData(faction, delta)]);
}

async function writeFlag(actor: any, key: RelationKey, entry: FlagEntry): Promise<void> {
  await actor.setFlag(MODULE_ID, `${FLAGS.relations}.${key}`, entry);
}

/** Sets a score, applying the member floor and the faction cap. GM only. */
export async function setScore(actor: any, key: RelationKey, score: number): Promise<number> {
  assertGM();
  const relations = getRelations(actor);
  const entry = relations[key] ?? { score: 0, member: false, notes: "" };

  if (isNpcKey(key)) {
    const value = clampScore(score, {});
    if (value !== entry.score || !(key in relations)) {
      await writeFlag(actor, key, { score: value, notes: entry.notes ?? "" });
    }
    return value;
  }

  const faction = requireFaction(key);
  const value = clampScore(score, { member: entry.member, cap: faction.cap });
  const delta = value - entry.score;
  if (delta !== 0 || !(key in relations)) await addRenown(actor, faction, delta);
  return value;
}

export async function adjustScore(actor: any, key: RelationKey, delta: number): Promise<number> {
  const current = getRelations(actor)[key]?.score ?? 0;
  return setScore(actor, key, current + delta);
}

async function setNativeMember(faction: any, actor: any, member: boolean): Promise<void> {
  const entries = memberEntries(faction);
  const has = entries.some((m) => m.uuid === actor.uuid);
  if (member === has) return;
  const next = member
    ? [...entries, { uuid: actor.uuid }]
    : entries.filter((m) => m.uuid !== actor.uuid);
  await faction.update({ "system.members": next });
}

/** Adds or removes membership in a faction. Joining lifts a negative score to 0 (2.5). */
export async function setMember(actor: any, factionId: string, member: boolean): Promise<void> {
  assertGM();
  const faction = getFactionActor(factionId);
  if (!faction) return;
  const key = factionKey(factionId);
  if (canBeNativeMember(actor)) {
    await setNativeMember(faction, actor, member);
  } else {
    const flag = flagRelations(actor)[key] ?? {};
    await writeFlag(actor, key, { ...flag, member });
  }
  const entry = getRelations(actor)[key];
  if (entry) await setScore(actor, key, entry.score);
}

export async function setNotes(actor: any, key: RelationKey, notes: string): Promise<void> {
  assertGM();
  if (isNpcKey(key)) {
    const entry = getRelations(actor)[key] ?? { score: 0 };
    await writeFlag(actor, key, { score: entry.score, notes });
    return;
  }
  const flag = flagRelations(actor)[key] ?? {};
  await writeFlag(actor, key, { ...flag, notes });
}

/** Creates a relation (score 0, or `init.score`) if it does not exist yet. */
export async function ensureRelation(
  actor: any,
  key: RelationKey,
  init: Partial<RelationEntry> = {},
): Promise<void> {
  assertGM();
  if (key in getRelations(actor)) return;
  if (isNpcKey(key)) {
    await writeFlag(actor, key, {
      score: clampScore(init.score ?? 0, {}),
      notes: init.notes ?? "",
    });
    return;
  }
  const faction = requireFaction(key);
  if (init.member) await setMember(actor, faction.id, true);
  if (init.notes) await setNotes(actor, key, init.notes);
  if (!(key in getRelations(actor)) || init.score) {
    await setScore(actor, key, init.score ?? 0);
  }
}

/**
 * Removes a relation. For a faction: the managed renown item, the membership
 * and the notes. Returns how many hand-made renown items still point to the
 * faction (they keep the relation visible until the GM deletes them).
 */
export async function removeRelation(actor: any, key: RelationKey): Promise<number> {
  assertGM();
  if (isNpcKey(key)) {
    if (key in flagRelations(actor)) await actor.unsetFlag(MODULE_ID, `${FLAGS.relations}.${key}`);
    return 0;
  }
  if (!isFactionKey(key)) return 0;
  const factionId = idFromKey(key);
  const faction = getFactionActor(factionId);
  const item = managedItem(actor, factionId);
  if (item) await actor.deleteEmbeddedDocuments("Item", [item.id]);
  if (faction && canBeNativeMember(actor)) await setNativeMember(faction, actor, false);
  if (key in flagRelations(actor)) await actor.unsetFlag(MODULE_ID, `${FLAGS.relations}.${key}`);
  if (!faction) return 0;
  const identifier = factionIdentifier(faction);
  return renownItems(actor).filter((i) => itemModifiers(i).some((m) => m.faction === identifier))
    .length;
}

export async function addNpcToFaction(actor: any, factionId: string): Promise<void> {
  assertGM();
  const faction = getFactionActor(factionId);
  if (faction) await setNativeMember(faction, actor, true);
}

export async function removeNpcFromFaction(actor: any, factionId: string): Promise<void> {
  assertGM();
  const faction = getFactionActor(factionId);
  if (!faction) return;
  await setNativeMember(faction, actor, false);
  // A token actor can also be listed through its base actor.
  const base = actor.isToken ? (actor.token?.baseActor ?? null) : null;
  if (base) await setNativeMember(faction, base, false);
}

/** Links any actor to a faction: score holders become members, NPCs join the members list. */
export async function linkActorToFaction(actor: any, factionId: string): Promise<boolean> {
  if (isScoreHolder(actor)) {
    await setMember(actor, factionId, true);
    if (!(factionKey(factionId) in getRelations(actor))) {
      await setScore(actor, factionKey(factionId), 0);
    }
    return true;
  }
  if (isNpc(actor)) {
    await addNpcToFaction(actor, factionId);
    return true;
  }
  return false;
}
