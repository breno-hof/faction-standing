# Requirements and Architecture Specification
**Foundry VTT module: Renown / Faction Standing (D&D 5e, 2024 rules)**

| Field | Value |
|-------|-------|
| Package id | `faction-standing` |
| Title | Faction Standing |
| Current version | 2.0.0 (renamed from `tidy-renown`; see 5.5) |
| Foundry VTT | **v14** (minimum `14`) |
| Required system | `dnd5e` **6.1.0+** (2024 rules) |
| Recommended module | `tidy5e-sheet` (Tidy 5e Sheets) **v14+**, for the Relations tab on Tidy sheets |
| Author / maintainer | breno-hof |

> **Single rules source:** only the 2024 *Dungeon Master's Guide*, **Renown** section of the "DM's Toolbox" chapter. Rules from the 2014 DMG, Adventurers League and older supplements (Initiate/Agent/Stalwart/Mentor/Exemplar ranks, "official" factions such as the Harpers or Zhentarim, secret mission requirements) are **out of scope**.
>
> Behavior that is **not** in the 2024 DMG and is automated by the module is marked **[Module extension]**.
>
> **dnd5e's own renown (since 2.0):** dnd5e 6.1.0 added `faction` actors (with `ranks` and `members`), `renown` items (score = sum of their modifiers) and a Renown tab on character and group sheets. The module uses that data as the **source of truth** and adds what is missing: rank and member editing, categories, color/cap/scale, quick and bulk score changes, individual relations with NPCs, notes, player +1 requests and automatic disposition. The module's tab is called **Relations** and appears on the default dnd5e sheets and on Tidy, next to dnd5e's Renown tab. See 5.3.

---

## 1. Overview and goals

The module implements the 2024 DMG's optional **Renown** rule and makes it quick and visual to manage:

- Groups: factions, organizations or communities (the DMG treats all three the same way).
- A renown score per character (or for the whole party) with each group.
- GM-defined ranks and titles based on score thresholds.
- Benefits (Recognition, Rank, Perks) shown as descriptive text.
- **[Module extension]** Negative relations between groups/NPCs and player characters, and automatic token disposition.

**Design principles**

1. **Easy to use:** create groups and change scores in a few clicks.
2. **Build on dnd5e:** factions, ranks, members and scores live in dnd5e's own data; the module only stores what dnd5e has no place for.
3. **Tidy 5e Sheets through its official API only** (Tidy renders with Svelte; editing its DOM fights the renderer). Tidy is optional.
4. **No duplicated data:** member lists and scores are read from dnd5e data at runtime.
5. **Automated pipeline** for builds, GitHub releases and foundryvtt.com publishing (Package Release API).

---

## 2. Business rules

### 2.1 2024 DMG rules (RAW)

| Concept | Rule |
|---------|------|
| Scope | Renown is tracked per character **or** for the whole party, separately for each group. |
| Starting value | 0 |
| Completing missions | +1 for advancing the group's interests; +2 for a mission assigned by the group or that directly benefits it; +3 or +4 for missions of great importance. All at the DM's discretion. |
| Group involvement (downtime) | With a score of 1+, a character who spends days between adventures equal to 10 × their current score doing minor tasks for the group gains +1. |
| Losing renown | Disagreements cause no loss; serious offenses against the group or its members cost renown and rank, as far as the DM decides. |
| Floor | A character's score with a group **never drops below 0**. |
| Cap | The DMG sets no cap. Its highest benefit threshold is 50. |
| Renown by level (optional) | Instead of tracking a score, the DM can use character level as an equivalent: level 1 → 1, 3 → 3, 5 → 10, 11 → 25, 17 → 50. |

### 2.2 Benefits (RAW, descriptive only)

| Score | Benefit suggested by the DMG |
|-------|------------------------------|
| 3+ | **Recognition:** a respected member; other members are Friendly by default and offer shelter and food in dire need. **Perks:** a reliable contact, a safe house or a discount on gear. |
| 10+ | **Perks:** access to potions and scrolls, calling in a favor, backup on dangerous missions. |
| 50 | **Perks:** calling on a small army, acquiring a Rare magic item, the help of a spellcaster, assigning missions to lower-ranked members. |

The module shows this text (editable per group) on the sheet. **Benefits are never automated.**

### 2.3 Ranks

The 2024 DMG **defines no default ranks**: the DM creates hierarchies and titles and uses score thresholds as a prerequisite (not necessarily the only one).

- Each group has ranks: `name`, `minimum score`, `description` (free text where the GM notes other prerequisites), `icon`.
- A new group starts **without ranks**. "Use DMG thresholds" adds three unnamed entries (3, 10 and 50) pre-filled with the benefit text from 2.2, for the GM to name.
- The current rank is the one with the highest `minimum score` ≤ the character's score, computed at runtime.
- Prerequisites other than the score are text only; the module does not check them.

### 2.4 Members and relations

- **Characters** (`character`) and the **party** (`group` actor) have a score with each group: the total of their renown items for that faction.
- **Characters and NPCs** become members through the faction actor's `system.members`. dnd5e only accepts creatures as members, so the **party's** membership is a module flag.
- Member lists are **read at runtime** from faction actors and renown items; the module keeps no copy.

### 2.5 [Module extension] Negative relations

The DMG keeps the floor at 0 for those with renown in a group. The module adds **hostile relations** outside of membership:

| Situation | Score range |
|-----------|-------------|
| Character who is a **member** of the group | `0` up to the cap (RAW floor) |
| Character who is **not a member** | may go negative |
| **Individual** relation between a character and a specific NPC | may go negative |

- Removing a member (unticking "member") lets the score go negative.
- Making a character a member lifts a negative score to 0.
- The floor and the cap apply to changes made through the module. Renown items the GM adds by hand can take the total outside that range.

### 2.6 [Module extension] Automatic token disposition

Relation scores drive the disposition of NPC tokens (`TokenDocument.disposition`).

**Effective score of an NPC toward one character (`s`)**

1. If the character has an individual relation with the NPC, use it.
2. Otherwise, use the character's **lowest** score among the groups the NPC belongs to (no entry counts as 0).
3. If the NPC belongs to no group and there is no individual relation, the NPC is left out of the automation.

**Party score (`S`)**

1. If dnd5e's primary party actor (`game.actors.party`) has an entry for the same target, use it (party-tracked renown, as the DMG allows).
2. Otherwise, the **average** of `s` across the primary party's members.
3. With no primary party, the average across every `character` actor owned by a player.

**Resulting disposition** (configurable thresholds; defaults −10 and 10)

| Condition | Disposition |
|-----------|-------------|
| `S < −10` | Hostile (`CONST.TOKEN_DISPOSITIONS.HOSTILE`) |
| `S > 10` | Friendly (`CONST.TOKEN_DISPOSITIONS.FRIENDLY`) |
| Otherwise | Neutral (`CONST.TOKEN_DISPOSITIONS.NEUTRAL`) |

**How it is applied**

- Updates the NPC's `prototypeToken` and every placed token of it.
- Tokens with **Secret** disposition are never changed.
- Tokens flagged `faction-standing.lockDisposition = true` are never changed (manual GM lock).
- Only one client writes: the active GM (`game.users.activeGM?.isSelf`).
- Triggers: changes to renown items, faction actors or module flags, token creation, a new primary party and threshold changes.
- Writes only when the disposition changes (no update cascades).
- Can be turned off globally.

> Rules note: the DMG's *Recognition* (members Friendly from 3+) is guidance for playing NPCs. The token automation above is a module table rule with its own thresholds. The GM can bring it closer to RAW by lowering the friendly threshold.

---

## 3. Functional requirements

### FR-01 – Group management (GM)
- Create, edit and delete groups (faction actors).
- Fields: name, category (`CONFIG.DND5E.factionCategories`), description, image, accent color, progress bar scale (default 50, visual only), optional cap (empty = no cap, as RAW), ranks and benefit text.
- Members and relations listed at runtime, with score and rank.
- GM only (ApplicationV2). Faction sheets (dnd5e and Tidy) get a **Ranks & members** header control that opens the manager on that faction.
- Deleting a group deletes the faction actor, the renown items the module manages for it and the notes kept for it. Hand-made renown items stay on the actors.

### FR-02 – Editing renown (GM only)
- **Only the GM** changes scores and memberships.
- Add or remove a character as a member; add or remove NPCs.
- Quick buttons (+1, −1), numeric input and bulk add/subtract for several actors.
- Create an individual character ↔ NPC relation (from the NPC's sheet or the manager).
- Score changes go into one module-managed renown item per actor and faction; hand-made items are never edited.
- Ranges from 2.5 apply (floor 0 for members).

### FR-03 – Player increases (optional)
- World setting `playersCanIncrease`, **off by default**.
- When on, a character's owner sees a **+1** button on their own entries.
- The request goes over the socket to the active GM, who checks that the user owns the actor, the delta is exactly +1 and the cap holds, and only then writes.
- With no active GM connected, the button is disabled with an explanatory tooltip.
- Players never lower scores, create relations or change memberships.

### FR-04 – Relations tab
- **Character and party:** a card per group with image, name, progress bar, score, current rank, next threshold, benefits reached and notes; individual NPC relations in a separate section.
- **NPC:** the groups it belongs to, individual relations and the computed disposition (with a lock indicator).
- Editing controls only for the GM (plus the FR-03 +1 when enabled), shown in edit mode.
- A friendly empty state when there are no relations.
- Follows the sheet's theme (dnd5e or Tidy; light and dark).

### FR-05 – Settings
| Setting | Scope | Default |
|---------|-------|---------|
| `playersCanIncrease` | world | `false` |
| `autoDisposition` | world | `true` |
| `hostileThreshold` | world | `-10` (hostile if score `<` value) |
| `friendlyThreshold` | world | `10` (friendly if score `>` value) |
| `showNpcRelationsToPlayers` | world | `false` |
| `factions` | world, hidden | `{}` (pre-2.0 groups; read by the migration only) |
| `legacyMigrated`, `nativeMigrated` | world, hidden | `false` (one-time migrations, 5.5 and 5.6) |

The module also turns on dnd5e's world setting `renownScore` on the active GM's client, with a notification, because dnd5e hides faction actors and renown items without it.

Fully localized in `en` and `pt-BR`.

### FR-06 – Relations tab on dnd5e sheets; Tidy optional
- `module.json` lists `tidy5e-sheet` under `relationships.recommends`.
- Default sheets: the tab is declared in the static `TABS`/`PARTS` of `CharacterActorSheet`, `GroupActorSheet` and `NPCActorSheet` (the way dnd5e declares its Renown tab). Context comes from a wrapper around `_preparePartContext`, events from the `renderBaseActorSheet` hook. Outside edit mode, GM controls are hidden.
- Tidy: tabs registered in the `tidy5e-sheet.ready` hook.
- Faction sheets (dnd5e and Tidy): header control through `getHeaderControlsActorSheetV2`.

### FR-07 – Persistence
- **Groups, ranks, members and scores** → dnd5e data (`faction` actors, `renown` items); see 5.3.
- **What dnd5e has no place for** (notes, NPC relations, color/cap/scale, rank descriptions, party membership) → module flags.
- The module keeps no copy of scores or member lists.

---

## 4. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Relations tab opens in < 100 ms with up to 20 groups. |
| NFR-02 | Runtime lookups in < 50 ms in worlds with up to 2,000 actors (in-memory index invalidated by actor and renown item hooks). |
| NFR-03 | Readable contrast in light and dark themes, on dnd5e and Tidy sheets. |
| NFR-04 | TypeScript + ESLint + Prettier; no type errors or lint warnings. |
| NFR-05 | esbuild build (`build.mjs`); script and CSS carry the version in their file names. |
| NFR-06 | CI/CD on GitHub Actions, with automatic publishing on foundryvtt.com. |
| NFR-07 | `manifest` points to `/releases/latest/download/module.json`; the published manifest's `download` points to its own tag's zip. |
| NFR-08 | Localized from the first version. |
| NFR-09 | Compatibility: Foundry v14, dnd5e 6.1+, Tidy 5e Sheets v14+ (optional). No support for older versions. |

---

## 5. Technical architecture

### 5.1 Layout

```
faction-standing/
├── .github/workflows/
│   ├── ci.yml                   # audit + npm run check on push/PR
│   └── release.yml              # tag vX.Y.Z → GitHub Release + Foundry Package Release API
├── module.json                  # source manifest (fixed version and URLs)
├── build.mjs                    # esbuild → dist/
├── src/
│   ├── main.ts                  # init/ready, settings, hooks, migrations
│   ├── migration.ts             # tidy-renown copy and conversion to dnd5e renown
│   ├── apps/
│   │   ├── FactionManagerApp.ts # manager, rank editor, actor picker (ApplicationV2)
│   │   └── NotesEditorApp.ts
│   ├── sheets/
│   │   ├── dnd5e-tabs.ts        # Relations tab on dnd5e sheets
│   │   └── faction-sheet.ts     # categories, faction sheet control, renownScore
│   ├── tidy/
│   │   ├── context.ts           # Relations tab view models
│   │   ├── controls.ts          # Relations tab events
│   │   └── register-tabs.ts     # Tidy registration
│   ├── data/
│   │   ├── types.ts
│   │   ├── rules.ts             # pure rules
│   │   ├── native.ts            # dnd5e renown accessors
│   │   ├── factions.ts          # faction actors as FactionDef
│   │   ├── renown.ts            # scores, members, notes, NPC relations
│   │   ├── kinds.ts             # faction categories
│   │   └── membership-index.ts  # runtime lookups
│   ├── services/
│   │   ├── disposition.ts       # 2.6
│   │   └── socket.ts            # player +1 requests (FR-03)
│   ├── styles/faction-standing.css
│   ├── templates/               # manager, dialogs, relations tabs, dnd5e tab wrapper
│   └── lang/                    # en.json, pt-BR.json
├── tests/
├── package.json
└── tsconfig.json
```

### 5.2 Tidy 5e Sheets integration (confirmed API)

Reference: the "07. Developer API" wiki page and the generated API at `kgar.github.io/foundry-vtt-tidy-5e-sheets`.

- The API is available in the `tidy5e-sheet.ready` hook or at `game.modules.get('tidy5e-sheet').api`.
- Tab methods: `registerActorTab`, `registerCharacterTab`, `registerNpcTab`, `registerVehicleTab`, `registerGroupTab`, `registerEncounterTab`, `registerItemTab`, `registerCharacterSidebarTab`.
- Tab models: `HtmlTab`, `HandlebarsTab`, `SvelteTab`. `tabId` is required and must carry the module prefix.
- Users can hide or reorder the tab in Tidy's Tab Selection settings.
- Tidy v14 dropped the Classic sheets; the module only targets the current ones.

```ts
Hooks.once("tidy5e-sheet.ready", (api) => {
  const tab = (tabId: string, path: string, build: (actor: any) => unknown) =>
    new api.models.HandlebarsTab({
      title: "FACTION_STANDING.TabTitle",
      iconClass: "fa-solid fa-handshake",
      tabId,
      path,
      getData: async (context) => ({ ...context, factionStanding: await build(context.actor) }),
      onRender: (params) => bindRenownControls(params.tabContentsElement, params.app),
    });

  api.registerCharacterTab(tab("faction-standing-character", ACTOR_TAB, buildScoreHolderContext));
  api.registerGroupTab(tab("faction-standing-group", ACTOR_TAB, buildScoreHolderContext));
  api.registerNpcTab(tab("faction-standing-npc", NPC_TAB, buildNpcContext));
});
```

**Look and feel:** colors come from Tidy's theme variables (`--t5e-*`) on Tidy sheets, dnd5e's (`--dnd5e-color-*`) on dnd5e sheets and Foundry's core variables in the manager, with no hard-coded colors outside fallbacks.

### 5.3 Data model (dnd5e 6.1 + module flags)

| Data | Where it lives |
|------|----------------|
| Group | A world `faction` actor. `FactionDef.id` = actor id; `identifier` = `system.identifier` (unique, generated from the name on creation). |
| Category | `system.type.value`, a key of `CONFIG.DND5E.factionCategories` (the module registers `faction`, `organization`, `community` when it is empty). |
| Description, image | `system.description.full`, `img`. |
| Ranks | `system.ranks[rankId] = { name, renown }` (`renown` = minimum score). Removed with `_del`. |
| Rank description/icon, color, scale, cap | `flags.faction-standing.{ranks, color, progressMax, cap}` on the faction actor. |
| Character/party score | Sum of the `system.modifiers` of the actor's `renown` items for the faction's `identifier`. |
| Changes made by the module | One `renown` item per actor and faction, `flags.faction-standing.faction = <faction actor id>`. Hand-made items keep counting and are never edited. |
| Member (character, NPC) | The faction's `system.members` (`{ uuid }`). Unlinked tokens can join through their synthetic actor's uuid. |
| Member (party) | `flags.faction-standing.relations.f_<id>.member` (dnd5e only accepts creatures as members). |
| Notes per relation | `flags.faction-standing.relations.<key>.notes`. |
| Individual NPC relation | `flags.faction-standing.relations.n_<npcActorId> = { score, notes }`. |

`getRelations(actor)` builds the `Record<RelationKey, RelationEntry>` view from this. An actor has a relation with a faction when it has a renown item for it, a membership or a note. Relation keys use ids, not UUIDs, because dots in flag keys become nesting.

**Pre-2.0 data** (read by the migration only, 5.6): world setting `faction-standing.factions` (`Record<id, FactionDef>`), `relations.f_<settingId> = { score, member, notes }` on actors and `memberOf: string[]` on NPCs and token deltas.

### 5.4 `module.json`

The root `module.json` is the source: it holds `version`, `manifest` (`/releases/latest/download/module.json`) and `download`. `build.mjs` writes a copy to `dist/module.json` with:

- `esmodules: ["scripts/main-<version>.js"]` and `styles: ["styles/faction-standing-<version>.css"]` (versioned names defeat caches);
- `download` pointing to `releases/download/v<version>/faction-standing.zip`, so a version-specific manifest installs that version.

Tidy goes under `relationships.recommends`, not `requires`.

### 5.5 Migration from the former id (`tidy-renown`)

Up to 1.2.3 the module was called Tidy Renown, id `tidy-renown`. Settings and flags are keyed by id, so on `ready` the active GM runs `migrateLegacyData()` once per world:

- world settings `tidy-renown.*` → `faction-standing.*` (groups only if the world has none under the new id yet);
- `tidy-renown` flags on actors, prototype tokens, tokens and unlinked token deltas → `faction-standing`, only where the new id is still empty;
- old data is **not deleted**;
- at the end it sets `faction-standing.legacyMigrated = true` and notifies the GM with counts.

Compendiums are not migrated. Files exported by the old version can still be imported (import ignores the `format` field).

### 5.6 Conversion to dnd5e renown

After 5.5, on the active GM's `ready` (once per world, `faction-standing.nativeMigrated`, only when the `faction` actor type exists):

1. each setting group becomes a `faction` actor (`flags.faction-standing.migratedFrom` keeps the old id, so an interrupted run does not create duplicates);
2. each character/party `relations.f_<old>` becomes the managed renown item with that score, and its notes move to the new key;
3. `member` on characters and `memberOf` on NPCs (and token deltas) become `system.members`; the party's becomes the flag;
4. the old setting and flags are left in place; the GM gets a notification with counts.

---

## 6. Build and publish pipeline

Same pipeline as `animations-5e-extras`.

### 6.1 Tools
- Build: esbuild through `build.mjs` (`--dev` adds source maps; `--watch` rebuilds).
- Lint: ESLint + Prettier. Tests: `node --test` over the `tsc` output.

### 6.2 `package.json` scripts

| Script | What it does |
|--------|--------------|
| `npm run build` | production build into `dist/` |
| `npm run dev` | watch build with source maps |
| `npm run link` | symlink `dist/` to `Data/modules/faction-standing` |
| `npm run check` | types, lint, formatting, i18n, tests and build |
| `npm run release:dry-run` | validate the current version with the Package Release API without publishing |

### 6.3 CI (`.github/workflows/ci.yml`)
On PRs and pushes to `main`: `npm ci`, `npm audit --audit-level=moderate` and `npm run check`.

### 6.4 Release (`.github/workflows/release.yml`)
Trigger: pushing a `vX.Y.Z` tag.

1. Checks that the tag, `module.json` and `package.json` agree on the version.
2. `npm ci` and `npm run check` (includes the build).
3. Zips `dist/` into `faction-standing.zip`.
4. Attests the zip's build provenance.
5. Creates the GitHub Release with `faction-standing.zip` and `module.json` (or uploads to it if it already exists).
6. `tools/foundry-release.mjs` registers the version on foundryvtt.com. Without the `FOUNDRY_RELEASE_TOKEN` secret the step logs a notice and succeeds.

To release: bump `version` in `module.json` and `package.json`, commit, `git tag vX.Y.Z && git push --tags`.

### 6.5 Package Release API
1. The `faction-standing` package must exist on foundryvtt.com (first submission is manual).
2. Copy the **Package Release Token** from the package page (starts with `fvttp_`).
3. Store it on GitHub under *Settings → Secrets and variables → Actions* as `FOUNDRY_RELEASE_TOKEN`.
4. The token can edit the package: never commit it. If it leaks, use "Refresh" on the package page.

Format: `POST https://foundryvtt.com/_api/packages/release_version/`, header `Authorization: fvttp_...`, body with `id`, `release.version`, `release.manifest` (the tag's manifest), `release.notes` and `release.compatibility`. A `429` is retried once after `Retry-After`.

### 6.6 Local development
1. `npm run dev`
2. `npm run link`
3. Reload the world (F5)

---

## 7. Interface (UI/UX)

### 7.1 Faction manager (GM)
- Sidebar listing the world's faction actors, with "New group", import, export and "Recalculate dispositions".
- Details tab: name, category, image, color, description, progress scale and cap; buttons to open the faction sheet, export and delete.
- Ranks tab: list with "Use DMG thresholds" and a dialog to add or edit a rank.
- Members tab: runtime list of members and relations grouped by folder, with search, quick score changes, member toggle, notes, bulk actions and drag-and-drop from the Actors directory.

### 7.2 Relations tab – character / party
- Header with title and "Manage" (GM only).
- One card per group:
  - image and name;
  - progress bar (positive up to `progressMax`; negative in a warning color);
  - score, current rank and next threshold;
  - benefits reached;
  - adjust buttons (GM) or +1 (player, when FR-03 is on).
- "Relations with NPCs" section (individual relations).

### 7.3 Relations tab – NPC
- Groups the NPC belongs to (the GM can add or remove).
- Individual relations with characters.
- Computed party score and resulting disposition, with a lock control.

### 7.4 Theme
Inherit light/dark and the accent color from the hosting sheet; no hard-coded colors.

---

## 8. Security and permissions

| Action | Who |
|--------|-----|
| Create, edit or delete groups | GM |
| Change scores, memberships or relations | GM |
| +1 on one's own character | The actor's owner, only with `playersCanIncrease` on, validated by the GM over the socket |
| See one's own scores | The actor's owner |
| See NPC relations | GM; players only with `showNpcRelationsToPlayers` |
| Update token disposition | Active GM only |

- Every handler checks `game.user.isGM` or `actor.isOwner`.
- The socket handler never trusts the payload: owner, delta and cap are re-checked on the GM side.

---

## 9. Roadmap

| Version | Scope |
|---------|-------|
| **0.9 (MVP)** | Group CRUD, relation flags, runtime members, Tidy tabs (character, party, NPC), GM editing, full pipeline with the Package Release API. |
| **1.0** | Configurable ranks, negative and individual relations, automatic disposition, optional player +1, en/pt-BR, documentation. |
| **1.1–1.2** | Group import/export, bulk changes, folder picker, notes editor. |
| **2.0** | Renamed to Faction Standing; Tidy optional; built on dnd5e 6.1 renown (faction actors, renown items, members); Relations tab on dnd5e sheets; new release pipeline. |
| **Next** | Member rank/role (dnd5e's `members[].rank/role`, still unused by its UI); score history from renown items; "renown by level" mode (RAW, 2.1); group involvement helper (downtime days); Journal integration for group missions. |

---

## 10. Acceptance criteria

- [ ] Activates only on Foundry v14 with dnd5e 6.1.0+.
- [ ] Turns on dnd5e's Renown setting and tells the GM.
- [ ] A world that used `tidy-renown` or pre-integration 2.0 data opens with faction actors, renown items, members and disposition locks in place.
- [ ] The GM creates a group, adds a character and changes the score in at most 3 clicks.
- [ ] The score shown equals dnd5e's Renown tab total; hand-made renown items are never edited.
- [ ] Member scores changed by the module never drop below 0; non-members and individual relations can go negative.
- [ ] The Relations tab appears on dnd5e and Tidy sheets for character, party and NPC and follows the theme.
- [ ] Faction sheets show the **Ranks & members** control for the GM.
- [ ] With `autoDisposition` on, an NPC member of a group with a party score `< −10` turns Hostile, `> 10` Friendly and Neutral in between; Secret or locked tokens do not change.
- [ ] With `playersCanIncrease` off (default), players change nothing; when on, they can only +1 their own characters.
- [ ] Data survives a world reload.
- [ ] Pushing a `vX.Y.Z` tag creates the Release with `module.json` and `faction-standing.zip` and registers the version on foundryvtt.com.
- [ ] `manifest` points to `/latest`; `download` and the manifest sent to the API point to the tag.
- [ ] No type or lint errors.

---

## 11. References

- D&D *Dungeon Master's Guide* (2024), chapter 3 "DM's Toolbox", **Renown** section.
- dnd5e system source, `release-6.1.1`: `module/data/actor/faction.mjs`, `module/data/item/renown.mjs`, `module/registry.mjs` (RenownRegistry), `module/applications/actor/*-sheet.mjs`.
- Tidy 5e Sheets: "07. Developer API" wiki and generated API (`kgar.github.io/foundry-vtt-tidy-5e-sheets`).
- Foundry VTT: *Package Release API* (`foundryvtt.com/article/package-release-api/`).
- Foundry VTT: *Introduction to Module Development* and *Package Management*.
