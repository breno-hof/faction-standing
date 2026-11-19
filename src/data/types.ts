/** A key of CONFIG.DND5E.factionCategories (the module registers faction/organization/community). */
export type FactionKind = string;

export interface RankDef {
  id: string;
  name: string;
  minScore: number;
  /** Benefits and any extra prerequisites (free text; never validated). */
  description?: string;
  icon?: string;
}

/**
 * View of a dnd5e `faction` actor. `id` is the actor id; `identifier` is what
 * renown items point to. Ranks come from `system.ranks` (minScore = renown),
 * their descriptions and the visual settings from this module's flags.
 */
export interface FactionDef {
  id: string;
  identifier: string;
  name: string;
  kind: FactionKind;
  description?: string;
  img?: string;
  color?: string;
  /** Scale of the progress bar (visual only). */
  progressMax: number;
  /** Optional cap; null means no cap (RAW). */
  cap: number | null;
  ranks: RankDef[];
}

/** `f_<factionId>` or `n_<npcActorId>`. */
export type RelationKey = string;

export interface RelationEntry {
  /** Faction keys: total of the actor's renown items for the faction (dnd5e). */
  score: number;
  /** Faction keys: listed in the faction's members (party actor: module flag). Never below 0. */
  member?: boolean;
  notes?: string;
}

export type Relations = Record<RelationKey, RelationEntry>;

export type Disposition = "hostile" | "neutral" | "friendly";
