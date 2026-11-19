import { getManagerMenuType, openFactionManager } from "./apps/FactionManagerApp.js";
import { MODULE_ID, TEMPLATES } from "./constants.js";
import { getFactions } from "./data/factions.js";
import { getMembers, invalidateMembershipIndex } from "./data/membership-index.js";
import { getRelations } from "./data/renown.js";
import {
  computeNpcStanding,
  recalculateAllDispositions,
  scheduleDispositionRecalc,
} from "./services/disposition.js";
import { LEGACY_ID, migrateLegacyData, migrateToNativeFactions } from "./migration.js";
import { isFactionActor, RENOWN_ITEM_TYPE } from "./data/native.js";
import { registerDnd5eTabs } from "./sheets/dnd5e-tabs.js";
import {
  ensureRenownEnabled,
  registerFactionCategories,
  registerFactionSheetControls,
} from "./sheets/faction-sheet.js";
import { registerSocket } from "./services/socket.js";
import { registerSettings } from "./settings.js";
import { registerTidyTabs } from "./tidy/register-tabs.js";
import { rerenderRenownViews } from "./ui-refresh.js";

Hooks.once("init", () => {
  registerSettings();
  registerFactionCategories();
  registerDnd5eTabs();
  registerFactionSheetControls();

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "FACTION_STANDING.Manager.Title",
    label: "FACTION_STANDING.Manager.Open",
    hint: "FACTION_STANDING.Manager.Hint",
    icon: "fa-solid fa-flag",
    type: getManagerMenuType(),
    restricted: true,
  });

  void foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATES));
});

// Fired by Tidy 5e Sheets when its API is ready; never fires if Tidy is inactive.
// Tidy is optional: without it the manager, token dispositions and the API still work.
Hooks.once("tidy5e-sheet.ready", (api: any) => {
  try {
    registerTidyTabs(api);
  } catch (err) {
    console.error(`${MODULE_ID} | failed to register Tidy tabs`, err);
  }
});

Hooks.once("ready", async () => {
  registerSocket();
  registerDataHooks();
  registerDirectoryButton();

  const module = game.modules.get(MODULE_ID);
  module.api = {
    openManager: openFactionManager,
    getFactions,
    getMembers,
    getRelations,
    computeNpcStanding,
    recalculateDispositions: () => recalculateAllDispositions(true),
  };

  await ensureRenownEnabled();
  try {
    await migrateLegacyData();
  } catch (err) {
    console.error(`${MODULE_ID} | could not copy data from ${LEGACY_ID}`, err);
  }
  try {
    await migrateToNativeFactions();
  } catch (err) {
    console.error(`${MODULE_ID} | could not convert factions to dnd5e faction actors`, err);
  }

  ui.actors?.render();
  scheduleDispositionRecalc();
});

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleViewsRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    rerenderRenownViews();
  }, 100);
}

function registerDataHooks(): void {
  const onActorChange = () => {
    invalidateMembershipIndex();
    scheduleViewsRefresh();
    scheduleDispositionRecalc();
  };

  Hooks.on("createActor", onActorChange);
  Hooks.on("deleteActor", onActorChange);
  Hooks.on("updateActor", (actor: any, changes: any) => {
    // Faction actors: name, identifier, ranks and members all feed the views.
    if (isFactionActor(actor)) return onActorChange();
    const touchesRenown = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
    const touchesParty = foundry.utils.hasProperty(changes, "system.members");
    const touchesOwnership = "ownership" in (changes ?? {});
    if (touchesRenown || touchesParty || touchesOwnership) onActorChange();
  });

  // Scores are renown items, whether this module or the GM changes them.
  const onItemChange = (item: any) => {
    if (item?.type === RENOWN_ITEM_TYPE && item.parent?.documentName === "Actor") onActorChange();
  };
  Hooks.on("createItem", onItemChange);
  Hooks.on("updateItem", onItemChange);
  Hooks.on("deleteItem", onItemChange);

  Hooks.on("createToken", () => scheduleDispositionRecalc());
  Hooks.on("updateSetting", (setting: any) => {
    if (setting?.key === "dnd5e.primaryParty") onActorChange();
  });
}

function registerDirectoryButton(): void {
  Hooks.on("renderActorDirectory", (_app: any, html: HTMLElement) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : (html as any)?.[0];
    const actions = root?.querySelector(".header-actions");
    if (!actions || actions.querySelector(`.${MODULE_ID}-open`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${MODULE_ID}-open`;
    button.innerHTML = `<i class="fa-solid fa-flag" inert></i> ${game.i18n.localize("FACTION_STANDING.Manager.Button")}`;
    button.addEventListener("click", () => openFactionManager());
    actions.append(button);
  });
}
