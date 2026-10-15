# Personal library and evidence-based player profile

Date: 2026-10-08. Scope: the first phase of the player experience, before personalized recommendations or additional AI features.

## Delivered behavior

- Independent bilingual `#player/library` and `#player/profile` pages share the player workspace's account and catalog.
- The library shows existing collection saves and new play records, with title/type search, collection filtering, and Want to play / Playing / Played / Liked shelves.
- Players can edit status, like/dislike, and a 500-character note, and save a game into a collection from the record dialog. Record removal preserves collection membership.
- Collections have an explicit personal/research/unspecified purpose. Previously saved collections retain their names, descriptions, and membership; the migration does not guess their purpose.
- The profile deduplicates likes and personal collection saves by game ID. Research and unclassified collections do not contribute. Disliked games are excluded from interests but remain in factual play history when marked Playing/Played.
- Each displayed type expands to its supporting games. Preferred types are explicitly chosen by the player; avoided types are omitted from inferred interests. Neither creates invented game evidence.
- The customer header no longer exposes mode/setup controls. The demo's browser-only persistence limitation remains beside personal save controls.

## Catalog corrections and provenance

All 80 shared catalog entries now have short gameplay-specific English and Chinese summaries. Each entry includes a `contentSource` with an official Steam store link, check date, and scope. Official app descriptions were retrieved for all 80 titles, with longer descriptions consulted where necessary to distinguish mechanics. The summaries are editorial paraphrases; tags are curated classifications, not an exhaustive Steam tag export.

Examples of corrected classifications:

| Game | Correction |
| --- | --- |
| PowerWash Simulator | First-person cleaning/simulation, not FPS. |
| Beat Saber | Rhythm and VR, not FPS. |
| Tiny Glade | Relaxed building, not FPS. |
| Portal 2 / Viewfinder | First-person puzzles, not FPS. |
| Backpack Battles | Inventory management and auto-battling, not a card battler. |

The catalog still has 80 records. Game IDs and names remain stable. Prices, ratings, review counts, ownership, and revenue remain synthetic sample metrics; these were not validated against store pages and are not used as evidence of an individual player's taste or play history. Existing historical evaluation reports are unchanged.

## Persistence and migration

Migration `0005_player_library` adds `player_games`, `player_preferences`, and collection purpose. It was tested both from an empty database and by upgrading a schema at `0004_create_users` containing an existing collection and description. The existing data survived and the new player tables started empty.

The private endpoints are `GET /api/me/games`, `PUT/DELETE /api/me/games/{gameId}`, and `GET/PUT /api/me/preferences`. Owner identity comes from the signed bearer token. Extra owner body fields are rejected and an owner query cannot redirect access. PostgreSQL upserts enforce one record per user/game. Preferences accept only catalog tags, at most 12 per group, with no preferred/avoided overlap.

The frontend retains confirmed state after an uncertain save, shows a retry action, and requires reloading before another mutation. An old account's pending response cannot reappear after switching account or signing out. Demo records use separate user-scoped local-storage keys and do not overwrite the pre-existing collection storage. Unreadable saved records/preferences produce an error rather than an empty-success replacement.

No existing application database was migrated during this verification. A temporary PostgreSQL 18 instance bound to loopback on port 55438 was used, with disposable data and isolated UUID-named test schemas. Existing database services and their data were left intact. To run the new API against an existing application database, first run `alembic upgrade head`; rerun `python -m app.scripts.seed` to apply the shared catalog corrections.

## Executed checks

| Check | Result |
| --- | --- |
| Complete frontend Vitest suite | 172 tests passed across 19 files. |
| Focused player-library UI rerun after final dialog/copy changes | 2 tests passed. |
| TypeScript and Vite production build | Passed. |
| Complete backend unittest suite with real PostgreSQL enabled | 92 tests passed, no skips. |
| Whitespace/error check | `git diff --check` passed. |

Frontend coverage includes account response races, late saves after logout, double-write blocking, unconfirmed writes followed by reload, corrupt local data, API errors without demo fallback, profile evidence rules, bilingual controls, and preservation of existing collection saves. Backend coverage includes authentication, owner isolation, invalid payloads, persistence across requests, duplicate upserts, clearing preferences, record deletion independent of collections, and migration preservation.

Commands, from the corresponding directories:

```powershell
# frontend/
npm test
npm run build
npx vitest run tests/player-library-ui.test.tsx --reporter=dot

# backend/; point the variable at an explicit disposable local test database
$env:GDL_TEST_DATABASE_URL="postgresql+psycopg://gdl@127.0.0.1:55438/postgres"
.\.venv\Scripts\python.exe -m unittest discover -s tests -t .
```

Browser checks used a separate frontend origin on port 4189 so the user's existing preview/browser data on port 4188 was not changed:

- Demo: recorded six games, edited Chinese notes and preferences, switched between English and Chinese, opened evidence, and checked game shelves and record dialogs.
- API: registered a disposable local account, created a collection and saved Celeste from inside the editor without accidentally submitting its draft; then saved Playing/Like/a note. After a full page reload, the record and collection remained available.
- API: preferred Puzzle and avoided Survival Horror persisted after reload. Signing out immediately removed the personal profile from the page. No warning/error entries were captured in that API browser tab.
- Responsive: 375 × 812 and 812 × 375 viewport checks found no horizontal page overflow. Mobile navigation was adjusted to wrap as a whole row. The native record dialog remained scrollable and usable.

Local verification servers and the temporary database were stopped after the checks. No paid AI request, commit, GitHub push, or deployment was performed in this phase.

## Screenshots and boundaries

- [Chinese library](../screenshots/player-library-zh.png)
- [English library](../screenshots/player-library-en.png)
- [Chinese profile](../screenshots/player-profile-zh.png)
- [English profile](../screenshots/player-profile-en.png)

Screenshots show six manually entered synthetic validation records. Fresh accounts and fresh demo storage start empty. No Steam account connection, external playtime import, or real-player telemetry is implemented. Playing/Played means the player selected that status; it is not measured time.

Homepage recommendations still use catalog rating/review ordering, and existing catalog/AI insight behavior is retained. Applying the editable profile to personalized recommendation ranking is the next phase. The new profile itself makes no AI request and does not change the DeepSeek provider contract.
