import { MODULE_ID, SETTINGS } from "./constants.js";
import { scheduleDispositionRecalc } from "./services/disposition.js";
import { rerenderRenownViews } from "./ui-refresh.js";

export function registerSettings(): void {
  registerInternalSettings();

  // Pre-2.0 faction definitions; only read by the migration to dnd5e faction actors.
  game.settings.register(MODULE_ID, SETTINGS.factions, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.playersCanIncrease, {
    name: "FACTION_STANDING.Settings.PlayersCanIncrease.Name",
    hint: "FACTION_STANDING.Settings.PlayersCanIncrease.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => rerenderRenownViews(),
  });

  game.settings.register(MODULE_ID, SETTINGS.autoDisposition, {
    name: "FACTION_STANDING.Settings.AutoDisposition.Name",
    hint: "FACTION_STANDING.Settings.AutoDisposition.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => scheduleDispositionRecalc(),
  });

  game.settings.register(MODULE_ID, SETTINGS.hostileThreshold, {
    name: "FACTION_STANDING.Settings.HostileThreshold.Name",
    hint: "FACTION_STANDING.Settings.HostileThreshold.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: -10,
    onChange: () => {
      rerenderRenownViews();
      scheduleDispositionRecalc();
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.friendlyThreshold, {
    name: "FACTION_STANDING.Settings.FriendlyThreshold.Name",
    hint: "FACTION_STANDING.Settings.FriendlyThreshold.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    onChange: () => {
      rerenderRenownViews();
      scheduleDispositionRecalc();
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.showNpcRelationsToPlayers, {
    name: "FACTION_STANDING.Settings.ShowNpcRelations.Name",
    hint: "FACTION_STANDING.Settings.ShowNpcRelations.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => rerenderRenownViews(),
  });
}

export function registerInternalSettings(): void {
  for (const key of [SETTINGS.legacyMigrated, SETTINGS.nativeMigrated]) {
    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });
  }
}

export function getSetting<T = unknown>(key: (typeof SETTINGS)[keyof typeof SETTINGS]): T {
  return game.settings.get(MODULE_ID, key) as T;
}

export function getThresholds(): { hostile: number; friendly: number } {
  return {
    hostile: Number(getSetting(SETTINGS.hostileThreshold)),
    friendly: Number(getSetting(SETTINGS.friendlyThreshold)),
  };
}
