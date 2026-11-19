/**
 * One-time copy of the data saved under the module's former id, `tidy-renown`.
 *
 * Settings and flags are keyed by module id, so a world that used the old
 * module would otherwise look empty. The copy only fills what is missing under
 * the new id and never deletes the old data, so switching back still works.
 * It runs once per world, on the active GM's client.
 */
import { FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { factionCreateData, toFactionDef } from "./data/factions.js";
import {
  canBeNativeMember,
  FACTION_TYPE,
  factionActors,
  factionIdentifier,
  memberEntries,
} from "./data/native.js";
import { isNpc, isScoreHolder, managedItem, managedItemData } from "./data/renown.js";
import {
  factionKey,
  idFromKey,
  isFactionKey,
  normalizeFaction,
  uniqueIdentifier,
} from "./data/rules.js";
import type { FactionDef } from "./data/types.js";

export const LEGACY_ID = "tidy-renown";

/** Raw stored data: flags of an inactive module are only reachable through `_source`. */
function source(doc: any): any {
  return doc?._source ?? doc;
}

function legacyFlags(data: any): Record<string, unknown> | null {
  const flags = data?.flags?.[LEGACY_ID];
  return flags && typeof flags === "object" && Object.keys(flags).length ? flags : null;
}

function hasCurrentFlags(data: any): boolean {
  const flags = data?.flags?.[MODULE_ID];
  return !!flags && typeof flags === "object" && Object.keys(flags).length > 0;
}

function parseSettingValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** World settings stored by the former module id, keyed by setting name. */
function legacySettings(): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const stored = game.settings.storage?.get?.("world");
  if (!stored) return found;
  const prefix = `${LEGACY_ID}.`;
  for (const setting of stored) {
    const key: string | undefined = setting?.key;
    if (key?.startsWith(prefix))
      found.set(key.slice(prefix.length), parseSettingValue(setting.value));
  }
  return found;
}

export interface MigrationResult {
  settings: number;
  actors: number;
  tokens: number;
}

export async function migrateLegacyData(): Promise<MigrationResult | null> {
  if (!game.users.activeGM?.isSelf) return null;
  if (game.settings.get(MODULE_ID, SETTINGS.legacyMigrated)) return null;

  const result: MigrationResult = { settings: 0, actors: 0, tokens: 0 };

  const registered = new Set<string>(Object.values(SETTINGS));
  for (const [key, value] of legacySettings()) {
    if (!registered.has(key) || key === SETTINGS.legacyMigrated) continue;
    if (key === SETTINGS.factions) {
      const current = game.settings.get(MODULE_ID, SETTINGS.factions) ?? {};
      if (Object.keys(current).length) continue;
    }
    await game.settings.set(MODULE_ID, key, value);
    result.settings++;
  }

  const actorUpdates: Record<string, unknown>[] = [];
  for (const actor of game.actors) {
    const data = source(actor);
    const update: Record<string, unknown> = { _id: actor.id };
    const flags = legacyFlags(data);
    if (flags && !hasCurrentFlags(data)) update[`flags.${MODULE_ID}`] = flags;
    const protoFlags = legacyFlags(data?.prototypeToken);
    if (protoFlags && !hasCurrentFlags(data?.prototypeToken)) {
      update[`prototypeToken.flags.${MODULE_ID}`] = protoFlags;
    }
    if (Object.keys(update).length > 1) actorUpdates.push(update);
  }
  if (actorUpdates.length) {
    await Actor.implementation.updateDocuments(actorUpdates);
    result.actors = actorUpdates.length;
  }

  for (const scene of game.scenes) {
    const tokenUpdates: Record<string, unknown>[] = [];
    for (const token of scene.tokens) {
      const data = source(token);
      const update: Record<string, unknown> = { _id: token.id };
      const flags = legacyFlags(data);
      if (flags && !hasCurrentFlags(data)) update[`flags.${MODULE_ID}`] = flags;
      // Unlinked tokens keep their own memberOf in the actor delta.
      const deltaFlags = legacyFlags(data?.delta);
      if (deltaFlags && !hasCurrentFlags(data?.delta)) {
        update[`delta.flags.${MODULE_ID}`] = deltaFlags;
      }
      if (Object.keys(update).length > 1) tokenUpdates.push(update);
    }
    if (tokenUpdates.length) {
      await scene.updateEmbeddedDocuments("Token", tokenUpdates);
      result.tokens += tokenUpdates.length;
    }
  }

  await game.settings.set(MODULE_ID, SETTINGS.legacyMigrated, true);
  if (result.settings || result.actors || result.tokens) {
    ui.notifications.info(game.i18n.format("FACTION_STANDING.Notify.Migrated", { ...result }));
  }
  return result;
}

export interface NativeMigrationResult {
  factions: number;
  items: number;
  members: number;
}

/** dnd5e 6.1+ registers the faction actor type. */
function nativeFactionsAvailable(): boolean {
  return FACTION_TYPE in (CONFIG.Actor?.dataModels ?? {});
}

/**
 * One-time conversion of the 2.0 data model (factions in a world setting,
 * scores and memberships in actor flags) to dnd5e 6.1 renown:
 *
 * - each setting faction becomes a `faction` actor (ranks in `system.ranks`,
 *   colors, cap and rank descriptions in this module's flags);
 * - each character/party score becomes this module's renown item on the actor;
 * - memberships of characters and NPCs (including unlinked tokens) become
 *   faction members; the party keeps its membership in a flag;
 * - notes move to the new faction key.
 *
 * The old setting and flags are left in place. A faction actor remembers the
 * setting id it came from, so an interrupted run resumes without duplicates.
 */
export async function migrateToNativeFactions(): Promise<NativeMigrationResult | null> {
  if (!game.users.activeGM?.isSelf || !nativeFactionsAvailable()) return null;
  if (game.settings.get(MODULE_ID, SETTINGS.nativeMigrated)) return null;

  const result: NativeMigrationResult = { factions: 0, items: 0, members: 0 };
  const stored = (game.settings.get(MODULE_ID, SETTINGS.factions) ?? {}) as Record<string, any>;
  const defs = Object.values(stored)
    .filter((f) => f && typeof f === "object" && f.id)
    .map((f) => normalizeFaction(f));

  const byOldId = new Map<string, FactionDef>();
  const taken = new Set(factionActors().map((a) => factionIdentifier(a)));
  for (const def of defs) {
    let actor = factionActors().find((a) => a.flags?.[MODULE_ID]?.migratedFrom === def.id);
    if (!actor) {
      const identifier = uniqueIdentifier(def.name, taken);
      taken.add(identifier);
      const data = factionCreateData(def, identifier);
      data.flags[MODULE_ID].migratedFrom = def.id;
      actor = await Actor.implementation.create(data);
      result.factions++;
    }
    byOldId.set(def.id, toFactionDef(actor));
  }

  const newMembers = new Map<string, string[]>();
  const addMember = (factionId: string, uuid: string | undefined) => {
    if (!uuid) return;
    const list = newMembers.get(factionId) ?? [];
    if (!list.includes(uuid)) list.push(uuid);
    newMembers.set(factionId, list);
  };

  for (const actor of game.actors) {
    if (isScoreHolder(actor)) {
      const raw = actor.getFlag(MODULE_ID, FLAGS.relations) ?? {};
      const items: any[] = [];
      const update: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries<any>(raw)) {
        if (!isFactionKey(key)) continue;
        const faction = byOldId.get(idFromKey(key));
        if (!faction) continue;
        const newKey = `flags.${MODULE_ID}.${FLAGS.relations}.${factionKey(faction.id)}`;
        if (!managedItem(actor, faction.id)) {
          items.push(managedItemData(faction, Number(entry?.score) || 0));
        }
        if (entry?.member) {
          if (canBeNativeMember(actor)) addMember(faction.id, actor.uuid);
          else update[`${newKey}.member`] = true;
        }
        if (entry?.notes) update[`${newKey}.notes`] = entry.notes;
      }
      if (items.length) {
        await actor.createEmbeddedDocuments("Item", items);
        result.items += items.length;
      }
      if (Object.keys(update).length) await actor.update(update);
    } else if (isNpc(actor)) {
      for (const oldId of oldMemberOf(actor)) {
        const faction = byOldId.get(oldId);
        if (faction) addMember(faction.id, actor.uuid);
      }
    }
  }

  // Unlinked tokens kept their own memberOf in the actor delta.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const ids = token.delta?.flags?.[MODULE_ID]?.[FLAGS.memberOf];
      if (!Array.isArray(ids)) continue;
      for (const oldId of ids) {
        const faction = byOldId.get(oldId);
        if (faction) addMember(faction.id, token.actor?.uuid);
      }
    }
  }

  for (const [factionId, uuids] of newMembers) {
    const actor = game.actors.get(factionId);
    if (!actor) continue;
    const entries = memberEntries(actor);
    const known = new Set(entries.map((m) => m.uuid));
    const added = uuids.filter((uuid) => !known.has(uuid));
    if (!added.length) continue;
    await actor.update({ "system.members": [...entries, ...added.map((uuid) => ({ uuid }))] });
    result.members += added.length;
  }

  await game.settings.set(MODULE_ID, SETTINGS.nativeMigrated, true);
  if (result.factions || result.items || result.members) {
    ui.notifications.info(
      game.i18n.format("FACTION_STANDING.Notify.MigratedNative", { ...result }),
      { permanent: true },
    );
  }
  return result;
}

function oldMemberOf(actor: any): string[] {
  const raw = actor.getFlag?.(MODULE_ID, FLAGS.memberOf);
  return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
}
