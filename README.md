# Faction Standing

A **Foundry VTT v14** module for **dnd5e 6.1+** that fills the gaps in the system's own renown
support (the optional **Renown** rule from the 2024 _Dungeon Master's Guide_) and adds relations with
NPCs and automatic token disposition. It works on the default dnd5e sheets and, optionally, on
**Tidy 5e Sheets**.

Formerly **Tidy Renown** (id `tidy-renown`). See [Coming from Tidy Renown](#coming-from-tidy-renown).

The full specification is in [`SPEC.md`](SPEC.md).

## How it fits dnd5e's renown

dnd5e 6.1 stores renown like this, and the module uses exactly that data:

| In dnd5e                            | What Faction Standing does with it                                         |
| ----------------------------------- | -------------------------------------------------------------------------- |
| **Faction** actor                   | It is the group. The manager edits its name, image, category, description. |
| Faction `ranks` (no UI in dnd5e)    | Rank editor with threshold, name and benefits text.                        |
| Faction `members`                   | Member list (characters and NPCs), with a folder picker and bulk changes.  |
| **Renown** items on an actor        | The score is their total. − / + changes one "Renown: <Faction>" item.      |
| Faction categories (empty in dnd5e) | Registers Faction, Organization and Community if the world has none.       |
| The sheet's **Renown** tab          | Unchanged. The module's tab is called **Relations** and sits next to it.   |

Renown items made by hand (say, "+2 Harbor job") count toward the score as usual. The module only
ever changes the one item it created for each faction.

Module-only features: individual relations with NPCs, GM notes per relation, a floor of 0 for members
and an optional cap on the changes it makes, progress bar color and scale, bulk changes, player +1
requests and automatic token disposition.

When the world loads, the module turns on dnd5e's Renown setting (without it, the system hides faction
actors and renown items) and tells the GM.

## Features

- **Faction manager** with a sidebar and Details, Ranks and Members tabs. Faction sheets get a
  **Ranks & members** button that opens the manager on that faction.
- **Ranks** with a renown threshold, name and description. "Use DMG thresholds" adds 3, 10 and 50.
- **Relations tab** on dnd5e and Tidy sheets (character, party, NPC): current and next rank, benefits
  reached, notes and relations with NPCs. GM controls show while the sheet is in edit mode.
- **Party:** the group actor can have a score and be a "member" (dnd5e only accepts creatures as
  members, so the party's membership is kept in a module flag).
- **Automatic token disposition:** NPCs turn Hostile below −10 and Friendly above 10 (configurable),
  based on the party's score with the NPC's factions or with the NPC itself. Secret or locked tokens
  are left alone.
- **Only the GM edits.** Optionally, players can ask for +1; the active GM validates and applies it.
- **Import/export** factions as JSON (importing creates faction actors).
- **Localized** in English and Brazilian Portuguese.

## Quick start (GM)

1. Click **Factions** in the Actors directory (or **Ranks & members** on a faction sheet).
2. **New group** creates a faction actor. Under **Ranks**, use **Use DMG thresholds** or add your own.
3. Under **Members**, add actors (folder picker, or drag them from the sidebar) and adjust with − / +.
   Tick several to add, subtract or change membership for all of them at once.
4. Notes for each relation: the note button on the Members tab or on the sheet's Relations tab.

Macro API: `game.modules.get("faction-standing").api` exposes `openManager`, `getFactions`,
`getMembers`, `getRelations`, `computeNpcStanding` and `recalculateDispositions`.

## Coming from Tidy Renown

The id changed from `tidy-renown` to `faction-standing`, so Foundry treats it as a different module:

1. Install **Faction Standing** from the manifest below (or from Foundry's module list).
2. In your world, enable Faction Standing and disable Tidy Renown.
3. Log in as GM. The first time, the module copies the data from the old id and then converts it to
   dnd5e renown: each group becomes a faction actor, each score becomes a renown item on the actor
   and memberships become faction members. It tells you how much it converted. The old data is not
   deleted.

The same conversion runs once for worlds that used the pre-integration 2.0 data. Compendiums are not
converted.

Group files exported by Tidy Renown can still be imported.

Manifest: `https://github.com/breno-hof/faction-standing/releases/latest/download/module.json`

## Development

Requires Node 22+ (CI uses Node 26).

```bash
npm ci                 # install dependencies from package-lock.json
npm run dev            # rebuild dist/ on change, with source maps
npm run link           # symlink dist/ to <Data>/modules/faction-standing
npm run check          # types, lint, formatting, i18n, tests and build
```

`npm run link` reads the Foundry data path from the `FOUNDRY_DATA` environment variable or from
`foundryconfig.json` (see `foundryconfig.example.json`).

### Layout

| Path                            | Contents                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| `module.json`                   | Source manifest; the build writes `dist/module.json`.              |
| `build.mjs`                     | esbuild build (script and CSS carry the version in the file name). |
| `src/data/rules.ts`             | Pure rules (floor, cap, ranks, renown totals, disposition).        |
| `src/data/native.ts`            | Access to dnd5e renown data (factions, renown items, members).     |
| `src/data/factions.ts`          | Faction actors as groups (ranks, flags, import/export).            |
| `src/data/renown.ts`            | Scores (renown items), membership, notes and NPC relations.        |
| `src/data/membership-index.ts`  | Runtime lookups (who relates to each faction and NPC).             |
| `src/sheets/`                   | Relations tab on dnd5e sheets and the faction sheet button.        |
| `src/services/disposition.ts`   | Automatic token disposition.                                       |
| `src/services/socket.ts`        | Player +1 requests.                                                |
| `src/migration.ts`              | Migration from `tidy-renown` and conversion to dnd5e renown.       |
| `src/tidy/`                     | Relations tab context, events and Tidy registration.               |
| `src/apps/FactionManagerApp.ts` | Faction manager (ApplicationV2).                                   |
| `tests/`                        | Rule tests and integration tests against a Foundry mock.           |

## Releasing

1. Bump `version` in both `module.json` and `package.json` (they must match) and commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.

The `release.yml` workflow checks the versions, runs `npm run check`, zips `dist/` into
`faction-standing.zip`, attests its provenance, creates the GitHub Release with the zip and
`module.json`, and registers the version on foundryvtt.com.

Registration on foundryvtt.com needs the `FOUNDRY_RELEASE_TOKEN` secret (the package page's _Package
Release Token_, starting with `fvttp_`) under _Settings → Secrets and variables → Actions_. Without it
the step is skipped and the GitHub Release still goes out. To validate without publishing:
`FOUNDRY_RELEASE_TOKEN=fvttp_... npm run release:dry-run`.
