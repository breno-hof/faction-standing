/**
 * Relations tab on the dnd5e 6.x sheets (character, group, NPC).
 *
 * dnd5e builds its sheet tabs from two static fields of each sheet class:
 * `TABS` (navigation; entries may carry a `condition`) and `PARTS` (one
 * Handlebars part per tab, rendered into the `tabs` container). Adding an
 * entry to both is how the system's own Renown tab is declared, so the tab
 * follows the sheet's own rendering, tab switching and edit mode.
 *
 * The part's context is added by wrapping `_preparePartContext` for our part
 * only; events are bound after each render through the `renderBaseActorSheet`
 * hook.
 */
import { MODULE_ID, SETTINGS, TAB_ID, TEMPLATES } from "../constants.js";
import { getSetting } from "../settings.js";
import { buildNpcContext, buildScoreHolderContext } from "../tidy/context.js";
import { bindRenownControls } from "../tidy/controls.js";

interface SheetSpec {
  className: string;
  template: string;
  npc: boolean;
}

const SHEETS: SheetSpec[] = [
  { className: "CharacterActorSheet", template: TEMPLATES.actorTab, npc: false },
  { className: "GroupActorSheet", template: TEMPLATES.actorTab, npc: false },
  { className: "NPCActorSheet", template: TEMPLATES.npcTab, npc: true },
];

const WRAPPED = Symbol.for(`${MODULE_ID}.preparePartContext`);

function npcTabVisible(): boolean {
  return game.user.isGM || !!getSetting<boolean>(SETTINGS.showNpcRelationsToPlayers);
}

/** Puts the tab before Biography (or at the end), like the system's own optional tabs. */
function insertTab(tabs: any[], entry: any): void {
  if (tabs.some((t) => t.tab === TAB_ID)) return;
  const index = tabs.findIndex((t) => t.tab === "biography");
  if (index < 0) tabs.push(entry);
  else tabs.splice(index, 0, entry);
}

export function registerDnd5eTabs(): void {
  const classes = (globalThis as any).dnd5e?.applications?.actor;
  if (!classes) {
    console.warn(`${MODULE_ID} | dnd5e sheet classes not found; no Relations tab on dnd5e sheets.`);
    return;
  }

  for (const spec of SHEETS) {
    const Sheet = classes[spec.className];
    if (!Sheet?.TABS || !Sheet?.PARTS) continue;

    insertTab(Sheet.TABS, {
      tab: TAB_ID,
      label: "FACTION_STANDING.TabTitle",
      icon: "fa-solid fa-handshake",
      condition: spec.npc ? () => npcTabVisible() : undefined,
    });
    Sheet.PARTS[TAB_ID] ??= {
      container: { classes: ["tab-body"], id: "tabs" },
      template: TEMPLATES.sheetTab,
      templates: [spec.template],
      scrollable: [""],
    };

    const proto = Sheet.prototype;
    if (proto[WRAPPED]) continue;
    const original = proto._preparePartContext;
    proto._preparePartContext = async function (partId: string, context: any, options: any) {
      const result = await original.call(this, partId, context, options);
      if (partId !== TAB_ID) return result;
      const actor = this.actor ?? this.document;
      result.factionStandingTemplate = spec.template;
      result.factionStanding = spec.npc
        ? buildNpcContext(actor)
        : await buildScoreHolderContext(actor);
      return result;
    };
    proto[WRAPPED] = true;
  }

  Hooks.on("renderBaseActorSheet", (app: any) => {
    const part = app.element?.querySelector?.(`[data-application-part="${TAB_ID}"]`);
    if (part) bindRenownControls(part.querySelector(`.${MODULE_ID}-tab`) ?? part, app);
  });
}
