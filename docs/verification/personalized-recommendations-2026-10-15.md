# Profile-driven player recommendations

Date: 2026-10-15. Follows the [personal library and profile](player-library-2026-10-08.md).

## Product behavior

The player discovery page now uses the user's confirmed game records, explicit preferences, and personal collections. Cards and the featured game give concrete English/Chinese reasons: a wishlist entry, a preferred type, or a shared type with a named game from personal interests or play history. Players can open their profile from the page and see confirmed changes on returning. Search remains independent and can intentionally find a game excluded from recommendations.

New accounts keep the previous stable catalog recommendations. While private records load, the page waits before showing a personalized list. A load failure shows general picks with a retry action and no personalized claim. An account change clears the old feed's reasons; a delayed response cannot restore them.

No new endpoint, table, library dependency, model prompt, or paid model call was introduced. The existing DeepSeek search and game-insight interfaces remain available. The exact API source identifiers remain unchanged; game-insight presentation uses customer-facing labels instead of showing implementation mode names.

## Ranking policy

The pure `recommendForPlayer` function returns both games and structured reasons. It reuses `buildPlayerProfile` for deduplicated interest/history evidence and does not persist a second inferred profile.

1. Exclude games with an avoided tag, explicit dislike, or Playing/Played status. A wishlist does not override these exclusions.
2. Other known likes and personal collection saves stay in the library unless explicitly marked Want to play. Research/unclassified saves neither boost nor exclude games.
3. Rank tiers: wishlist, explicit preferred types, related interest/history evidence, then broader exploration. Explicit preferences outrank popularity and inferred taste.
4. Within a tier, each preferred tag contributes 6 points. Interest evidence contributes twice the weight of play-history evidence. A tag's evidence weight is `min(distinct supporting games, 3) / sqrt(catalog games with that tag)`. This limits broad/common tags and large collections. The candidate cannot be its own evidence, and disliked history is never positive evidence.
5. Select up to six, subtracting 0.35 per previously selected occurrence of a candidate's tags within its tier to encourage variety. Rating, review count, title, and ID provide deterministic tie-breaks. The function does not relax exclusions to fill empty slots.

Reasons explain factual matching signals, not a probability or AI confidence. The rules and weights are product choices, not a learned or user-validated recommender. Catalog metrics remain sample data. No measured playtime or behavior telemetry is inferred.

## Validation

- The frontend now has 185 tests across 21 files. The complete run passed 184 and exposed one selection regression; after the fix, all 18 affected recommendation/account UI tests passed in a focused rerun. An earlier outdated bilingual title expectation was also updated to the new personalized behavior.
- TypeScript and Vite production build passed after the final selection fix.
- Unit checks cover cold start, research exclusion, preference priority, hard exclusions, insufficient candidates, wishlist behavior, deduplication, evidence source identity, distinct play-history reasons, variety, determinism, and input immutability.
- UI checks cover editing preferences then returning to discovery, reload persistence, Chinese/English reasons, independent search, newly played games leaving the cards and featured pick, intentional saved-game inspection, logout/login as another account, failed-load recovery, and a late response after logout.
- The selection regression occurred because an unrelated save recreated the feed object and reset the chosen game. Selection now also checks eligibility and account/revision scope: an eligible selected game survives, an excluded one moves to the new first pick, and another account never inherits the choice.
- Real-browser checks used a fresh isolated headless Edge context at `127.0.0.1:4189`, separate from the user's existing browser storage. Ready or Not was marked Not for me, Celeste was marked Played/Like, Outer Wilds was marked Want to play, Puzzle/Cozy were preferred, and FPS was avoided. The resulting feed started with Outer Wilds, PICO PARK, Tiny Glade, TUNIC, Sticky Business, and Human Fall Flat. Reload preserved this order. These were synthetic records entered through the UI for validation only.
- Viewports of 1440 × 1000, 375 × 812, and 812 × 375 were checked. Mobile and landscape document width matched viewport width; the preference action was 44 px tall. No page errors were captured.

The authenticated UI paths use controlled service responses in this phase; this is not a new real-database end-to-end run. Backend persistence code is unchanged from the previous phase, whose 92-test database run is recorded separately. Its uploaded commit `f7b7a16` also passed [GitHub Actions](https://github.com/ZedekiahS/Game-Discovery-Lens/actions/runs/38757433414).

Commands from `frontend/`:

```powershell
npm test -- --reporter=dot
npx vitest run tests/recommendation-ui.test.tsx tests/personalized-recommendation-ui.test.tsx tests/panels-ui.test.tsx --reporter=dot
npm run build
```

## Screenshots

- [Chinese recommendations](../screenshots/personalized-recommendations-zh.png)
- [English recommendations](../screenshots/personalized-recommendations-en.png)
- [Mobile recommendations](../screenshots/personalized-recommendations-mobile.png)

The screenshots use synthetic validation preferences; the application does not seed these into a new account. Ranking quality still needs independent scenarios or user feedback. These checks establish consistent, explainable behavior and privacy boundaries, not measured relevance, click-through, or retention.

## Reliability and customer-interface follow-up

The follow-up adds collection clear/delete confirmation, unsaved record/preference protection, a 30-second HTTP deadline, and a reload requirement after an uncertain collection write. Drafts remain mounted through a record/preference reload. Search controls no longer expose raw intent JSON or internal source diagnostics, and collection insights no longer display rules-engine or implementation-next-step copy.

New registrations and fresh browser profiles now receive a personal default collection. Existing research and unspecified collections, including legacy saved-only browser storage, are preserved. A regression surfaced when saving the selected recommendation immediately changed the personalized feed: its detail panel jumped to another game. The save picker now pins the inspected game, while confirmed play-record or preference changes still invalidate an excluded selection.

Final local validation on 2026-10-15:

- Frontend: **197/197 tests across 22 files passed**, using `node ./node_modules/vitest/vitest.mjs run --maxWorkers=2`.
- Backend: **93/93 tests passed**, including PostgreSQL integration cases against a temporary PostgreSQL 18 instance and isolated schemas. AI was disabled; no paid provider requests were made.
- TypeScript and Vite production build: **passed**.
- Added coverage checks stalled responses and bodies, request cancellation, no automatic write replay, blocked mutations until a successful reload, failed reloads, confirmation cancel/focus restoration, independent notes/play records after collection removal, unsaved drafts, and preservation of legacy collection purposes.
- Browser review used the in-app browser at `127.0.0.1:4190/?mode=demo`, with storage separate from the existing preview origin. A fresh personal default was visible, saving Ready or Not updated recommendations without changing its details, and the profile counted the saved game as personal evidence. Cancelling collection clear retained that save. These were locally entered validation actions, not production activity.
- The Chinese confirmation was inspected at a 375 × 812 viewport: text and actions fit, the destructive action is visually distinct, and Cancel receives initial focus. See the [mobile confirmation screenshot](../screenshots/collection-confirmation-mobile-zh.png).
- The browser displayed the unsaved-note confirmation, but its control connection then timed out; dismissal and the remaining English desktop browser checks were not confirmed in this pass. Automated component tests cover discard cancellation and bilingual behavior. No new browser-to-live-API end-to-end claim is made.

Account settings, external login providers, and server-side token revocation remain outside this iteration.

## Real API and browser completion — 2026-10-16

The previously interrupted manual checks are now complete. Computer Use drove the in-app browser against the real FastAPI service and an isolated temporary PostgreSQL database. It registered a synthetic account, signed in, saved Ready or Not, entered a Played/Like record and a note, chose a Puzzle preference, and checked the resulting recommendations in Chinese and English. Refresh retained the collection, note, preference, and recommendation order. Logout hid private records; signing back in restored them.

The manual review also cancelled collection clearing with Escape and checked focus restoration. It dismissed the unsaved-note prompt both when closing the record editor and when using browser Back; the draft and library location remained intact. The temporary draft was then restored to its saved value, the account signed out, and the browser tab closed. See the [English real-API journey screenshot](../screenshots/api-journey-en.png). All entered account and activity data were synthetic test data in the isolated database.

Repeatable Playwright coverage now runs the real browser, migrations, API, and PostgreSQL together. Three scenarios run at both 1440 × 1000 and 375 × 812: the complete account/library/profile/recommendation journey with second-account isolation, a committed write whose response is lost, and draft/destructive-action cancellation. The lost-response case commits through the actual API before aborting the response, then asserts reconciliation with exactly one write. No successful API response is substituted by a fixture.

The mobile run exposed an actual layout regression: the open collection picker covered the next game-record action. On narrow screens the picker now expands in normal document flow, preserving access to the next action. Both viewport projects passed after this fix.

Final local results:

- Frontend unit/component tests: **197/197 passed across 22 files**.
- Backend tests: **93/93 passed**, including real PostgreSQL integration cases.
- Desktop/mobile browser journeys: **6/6 passed** in a single run after the mobile fix, with retries disabled.
- TypeScript and Vite production build: **passed** after the final CSS change.
- GitHub Actions now has a separate Browser and Real API job with PostgreSQL 16 and failure traces/screenshots. Local database checks used PostgreSQL 18; the browser project is Chromium-based and does not claim Safari or physical-device coverage.

Reproduce with `npm test`, `npm run build`, and `npm run test:e2e` from `frontend/`; the browser command requires `GDL_E2E_DATABASE_URL` as described in the frontend README. Backend checks use `python -m unittest discover -s backend/tests -t backend` with `GDL_TEST_DATABASE_URL` pointing to a test database. AI was disabled for this verification; paid-provider availability was not tested.

The initial dependency audit reported zero production dependency findings and eight development dependency findings (two moderate, four high, two critical). Playwright was not among the reported affected packages. These findings were subsequently addressed in the follow-up below.

## Development dependency remediation — 2026-10-16

The eight findings were traced to the Vitest test runner and the Babel/Vite build dependency chains. Vitest was upgraded from 3.2.7 to the first patched 4.x release, 4.1.11. Its [security advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) states that 3.x will not receive the mocker fix. The new runner also removes Tinypool from this project's dependency tree, eliminating its [affected worker dependency](https://github.com/advisories/GHSA-85c8-ppgw-ccpr). The remaining packages were updated within their parents' existing semver ranges.

| Audited package | Previous version | Resolved version |
| --- | --- | --- |
| vitest | 3.2.7 | 4.1.11 |
| @vitest/mocker | 3.2.7 | 4.1.11 |
| tinypool | 1.1.1 | Removed from the dependency tree |
| [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | 2.10.34 | 2.11.29 |
| [browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | 4.28.2 | 4.29.3 |
| [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | 3.3.12 | 3.3.20 |
| [postcss](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | 8.5.15 | 8.5.30 |
| [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | 1.2.1 | 1.2.2 |

React, Vite, Playwright, application source, and existing test assertions are unchanged. The [Vitest 4 migration guidance](https://v4.vitest.dev/guide/migration.html) was checked against the existing configuration and mocking usage. No advisory exclusions, dependency overrides, or forced downgrade were introduced. npm 11 generated the updated lockfile after the local npm 10 installer hit an internal peer-resolution error; a subsequent clean `npm ci` with npm 10.9.2 succeeded. Local checks use Node.js 24.19.0, which satisfies Vitest's supported engines; CI retains Node.js 20. The machine's default Node.js 23 was not used to run the upgraded suite.

After the clean installation, `npm audit --json` reported **zero vulnerabilities across production and development dependencies**. The original **197 frontend tests across 22 files** and **93 backend tests**, including PostgreSQL integration tests, passed. TypeScript and the production build also passed. All **6 desktop/mobile real-API browser journeys** passed with retries disabled, covering account isolation, persisted records and preferences, recommendations, lost-response recovery, and cancellation controls. GitHub Actions now runs `npm audit --audit-level=low` alongside the existing frontend checks, including development dependencies.
