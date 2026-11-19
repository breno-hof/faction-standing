export const MODULE_ID = "faction-standing";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const TIDY_ID = "tidy5e-sheet";

/** Tidy 5e Sheets is optional: without it the Relations tab lives on the dnd5e sheets. */
export function tidyActive(): boolean {
  return !!game.modules.get(TIDY_ID)?.active;
}

/** Flag keys stored under `flags.faction-standing.*`. */
export const FLAGS = {
  /**
   * On `character` / `group` actors: Record<RelationKey, RelationEntry>.
   * Faction scores and memberships live in dnd5e data (renown items, faction
   * members); here a faction key only keeps notes and, for the party actor,
   * membership. NPC keys keep the whole individual relation.
   */
  relations: "relations",
  /** Pre-2.0 data: on `npc` actors, string[] of setting faction ids. Read by the migration only. */
  memberOf: "memberOf",
  /** On renown items managed by this module: the faction actor id. */
  managedFaction: "faction",
  /** On faction actors: accent color, progress scale and cap. */
  color: "color",
  progressMax: "progressMax",
  cap: "cap",
  /** On faction actors: Record<rankId, { description, icon }>, next to system.ranks. */
  ranks: "ranks",
  /** On TokenDocuments and prototype tokens: boolean. */
  lockDisposition: "lockDisposition",
} as const;

export const SETTINGS = {
  factions: "factions",
  playersCanIncrease: "playersCanIncrease",
  autoDisposition: "autoDisposition",
  hostileThreshold: "hostileThreshold",
  friendlyThreshold: "friendlyThreshold",
  showNpcRelationsToPlayers: "showNpcRelationsToPlayers",
  /** World flag: data from the former `tidy-renown` id was already copied. */
  legacyMigrated: "legacyMigrated",
  /** World flag: setting-based factions were converted to dnd5e faction actors. */
  nativeMigrated: "nativeMigrated",
} as const;

export const TEMPLATES = {
  manager: `modules/${MODULE_ID}/templates/faction-manager.hbs`,
  rankEditor: `modules/${MODULE_ID}/templates/rank-editor.hbs`,
  actorPicker: `modules/${MODULE_ID}/templates/actor-picker.hbs`,
  notesEditor: `modules/${MODULE_ID}/templates/notes-editor.hbs`,
  actorTab: `modules/${MODULE_ID}/templates/actor-relations-tab.hbs`,
  npcTab: `modules/${MODULE_ID}/templates/npc-relations-tab.hbs`,
  /** Wrapper that turns a relations template into a dnd5e sheet tab part. */
  sheetTab: `modules/${MODULE_ID}/templates/dnd5e-sheet-tab.hbs`,
} as const;

/** Prefixes for relation keys (ids, not UUIDs: dots in flag keys become nesting). */
export const FACTION_PREFIX = "f_";
export const NPC_PREFIX = "n_";

/** Tab id / part id of the Relations tab on dnd5e and Tidy sheets. */
export const TAB_ID = MODULE_ID;

/** Faction categories registered in CONFIG.DND5E.factionCategories when the world has none. */
export const DEFAULT_KINDS = ["faction", "organization", "community"] as const;

/** Actor types that hold renown scores. */
export const SCORE_HOLDER_TYPES = ["character", "group"] as const;

/** Benefit thresholds named in the DMG 2024 Renown section. */
export const DMG_THRESHOLDS = [3, 10, 50] as const;

export const DEFAULT_PROGRESS_MAX = 50;
