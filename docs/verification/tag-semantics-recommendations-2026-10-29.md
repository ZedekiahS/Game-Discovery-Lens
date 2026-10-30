# Tag semantics and recommendation calibration — 2026-10-29

## Scope and baseline

Started at clean `04027f8e53ff6e005d67f8d1c4172f993a0e5bcc`; fetched `origin/main` matched. This round calibrates directional tag matching, investigates weak recommendation evidence, and replaces the stale SQL Server-first migration plan. No architecture replacement, public comments, catalog expansion, main-database reset, paid model call or user-data migration.

## Reproduced issues and resulting behavior

- The catalog contained 15 games tagged Co-op without Multiplayer. Literal matching let them through a Multiplayer exclusion. Before-change execution returned Ready or Not and Left 4 Dead 2 for `FPS without multiplayer`; the repaired real SQL/demo path returns Half-Life: Alyx and MULLET MADJACK. Raw game tags are unchanged.
- A Horror preference did not exclude Survival Horror. Two new frozen avoidance scenarios reproduced five forbidden recommendations, including wishlisted games. The final reports contain zero violations.
- Subtracting a repeated-tag diversity penalty could promote a weaker match after several picks. Player-count coincidence also supplied misleading gameplay similarity. Code inspection motivated these hypotheses; fixed scenario runs and targeted regression cases reproduced them.
- The first candidate removed that penalty and player-count-only evidence but regressed Ori from 4/6 to 3/6: Action + Exploration could still outrank Platformer. That intermediate output is retained. The final generic rule prioritizes concrete gameplay evidence, without any game-ID exception or relevance-label changes.
- Browser regression exposed a new preference-editor bug: changing the avoided group changed object key order. Comparing serialized whole objects kept a saved form dirty and blocked Discover navigation. Comparing the actual two arrays fixes the false warning while retaining unsaved-draft guards. The first browser run was 25/26; the final run is recorded below.
- `docs/migration-plan.md` still scheduled SQL Server deployment, a future FastAPI layer, and unsupported review summarization. It now describes the implemented React/FastAPI/PostgreSQL portfolio application, legacy scope, actual AI boundaries and deferred work.

## Small shared contract

`catalog/tag-families.json` defines exactly two directional families. TypeScript and Python consume the same file. Multiplayer matches Multiplayer or Co-op; Horror matches Horror or Survival Horror. The reverse implication does not hold. The same matching applies to positive/negative search, preferences, recommendation eligibility and hidden interest tags. Factual play-history rows retain original tags.

Required Co-op + excluded Multiplayer is impossible and returns 422. Preferred Co-op + avoided Multiplayer is rejected on new writes; existing stored combinations remain readable, with avoidance taking precedence. Preferred Multiplayer + avoided Co-op remains valid. Selecting a contradictory opposite condition removes it visibly in search/profile chips. Exclusions do not rewrite or erase private records, favorites or wishlists. Backend ownership still comes from the bearer token.

A short bilingual clarification appears only near selected Multiplayer/Co-op conditions. Singleplayer is not a promise of singleplayer-only. Missing mode tags remain unknown: this is a bounded relation over editorial tags, not a complete capability inventory.

## Official-source checks

The 15 Co-op entries lacking Multiplayer were checked against their official Steam product pages on 2026-10-29. The check establishes multiplayer/cooperative support, not price, rating, demand or every platform's feature parity. No review text or market values were imported. Existing per-record `contentSource.checkedAt` values were not advanced by this narrower audit.

| Game | Official product page | Observed support |
| --- | --- | --- |
| Split Fiction | [Steam](https://store.steampowered.com/app/2001120/) | Online / shared-screen co-op |
| Enshrouded | [Steam](https://store.steampowered.com/app/1203620/) | Online co-op |
| Ready or Not | [Steam](https://store.steampowered.com/app/1144200/) | Online co-op |
| Raft | [Steam](https://store.steampowered.com/app/648800/) | Online co-op |
| Bloons TD 6 | [Steam](https://store.steampowered.com/app/960090/) | Online co-op |
| PowerWash Simulator | [Steam](https://store.steampowered.com/app/1290000/) | Online co-op |
| Left 4 Dead 2 | [Steam](https://store.steampowered.com/app/550/) | Online co-op / PvP |
| The Planet Crafter | [Steam](https://store.steampowered.com/app/1284190/) | Online co-op |
| Portal 2 | [Steam](https://store.steampowered.com/app/620/) | Online / shared-screen co-op |
| Grim Dawn | [Steam](https://store.steampowered.com/app/219990/) | Online / LAN co-op |
| PlateUp! | [Steam](https://store.steampowered.com/app/1599600/) | Online / shared-screen co-op |
| Enter the Gungeon | [Steam](https://store.steampowered.com/app/311690/) | Multiplayer / shared-screen; local co-op tag |
| Sun Haven | [Steam](https://store.steampowered.com/app/1432860/) | Online co-op |
| State of Decay 2 | [Steam](https://store.steampowered.com/app/495420/) | Online co-op |
| Human Fall Flat | [Steam](https://store.steampowered.com/app/477160/) | Online / shared-screen co-op |

## Recommendation comparison

All reports use the identical 80-game catalog, saved/played records and frozen relevance IDs. The original 11-scenario fixture is unchanged. Six additional scenarios were authored by the coding agent before the first ranking run; four carry relevance labels and two carry independent forbidden IDs. They were then used diagnostically, so they are calibration scenarios, not independent human judgments or a held-out benchmark. No relevance labels were edited after looking at outputs.

The final rule retains wishlist and explicit preference precedence. Concrete gameplay evidence ranks above contextual themes; Singleplayer/Multiplayer alone are not inferred evidence. Explicitly chosen modes still count. Capped counts and inverse-square-root tag frequency remain; diversity now breaks equal-score ties. Reasons follow the same evidence used for ranking. This introduces no AI call, persistence layer or additional catalog request.

| Set | Before macro P@6 | First candidate | Final | Forbidden results before → final |
| --- | ---: | ---: | ---: | ---: |
| Original (8 scored / 11 total) | 0.8750 | 0.8958 | 0.8958 | 0 → 0 |
| New calibration (4 scored / 6 total) | 0.5833 | 0.7083 | 0.9583 | 5 → 0 |

### Original scored scenarios

| Scenario | P@6 before | Candidate | Final | nDCG@6 before → final |
| --- | ---: | ---: | ---: | ---: |
| cozy-evening | 1.0000 | 1.0000 | 1.0000 | 1.0000 → 1.0000 |
| puzzle-discovery | 1.0000 | 1.0000 | 1.0000 | 1.0000 → 1.0000 |
| cooperative-weekend | 1.0000 | 1.0000 | 1.0000 | 1.0000 → 1.0000 |
| wishlist-first | 1.0000 | 1.0000 | 1.0000 | 1.0000 → 1.0000 |
| celeste-fan | 0.6667 | 0.8333 | 0.8333 | 0.7751 → 0.8829 |
| space-explorer | 0.6667 | 0.5000 | 0.5000 | 0.9829 → 0.8319 |
| personal-collection | 0.6667 | 0.8333 | 0.8333 | 0.7751 → 0.8829 |
| negative-overrides-wishlist | 1.0000 | 1.0000 | 1.0000 | 1.0000 → 1.0000 |

Reports: [before](../evaluations/recommendations-original-before-2026-10-29.json), [candidate](../evaluations/recommendations-original-candidate-2026-10-29.json), [after](../evaluations/recommendations-original-after-2026-10-29.json).

### Calibration scored scenarios

| Scenario | P@6 before | Candidate | Final | nDCG@6 before → final |
| --- | ---: | ---: | ---: | ---: |
| ori-traversal | 0.6667 | 0.5000 | 1.0000 | 0.7409 → 1.0000 |
| deckbuilder-runs | 0.5000 | 1.0000 | 1.0000 | 0.6013 → 1.0000 |
| portal-puzzles | 0.5000 | 0.5000 | 1.0000 | 0.4383 → 1.0000 |
| hollow-exploration | 0.6667 | 0.8333 | 0.8333 | 0.7526 → 0.8922 |

Reports: [before](../evaluations/recommendations-calibration-before-2026-10-29.json), [candidate](../evaluations/recommendations-calibration-candidate-2026-10-29.json), [after](../evaluations/recommendations-calibration-after-2026-10-29.json).

The original space scenario falls from 4/6 to 3/6 because The Planet Crafter is now correctly excluded by Multiplayer avoidance. Its unchanged labels contain only three remaining eligible relevant games, so six relevant outputs are impossible under this fixture. We preserve that decrease rather than rewriting labels. Celeste's 5/6 still includes a broad Difficult match; the catalog's incomplete gameplay tags constrain quality. Deckbuilder labels allow related roguelike runs, so 6/6 does not mean six actual deckbuilders.

Reproduce from `frontend/`:

```powershell
node scripts/evaluate-recommendations.mjs ../docs/evaluations/recommendations-original-after-2026-10-29.json
node scripts/evaluate-recommendations.mjs ../docs/evaluations/recommendations-calibration-after-2026-10-29.json ../tests/fixtures/recommendation-calibration.json
```

Before reports used the baseline ranking with the same evaluator and fixture. Candidate reports preserve the first revision before concrete/contextual prioritization. Historical October 25 reports remain unchanged.

## Verification environment and checks

Windows, Node 24.22.0, Python 3.12.7, PostgreSQL 18 on loopback port 55437. The modern catalog remains 80 games. Real-database tests create their own UUID schemas in a dedicated local test database; no application schema or user data is cleared. The API/browser harness forces rules-only AI and uses temporary test accounts.

- Backend: `GDL_TEST_DATABASE_URL=... python -m unittest discover -s backend/tests -t backend` — 115 passed, no skipped PostgreSQL checks (63.847 s).
- Frontend: `npm test` — 279 passed in 26 files (80.38 s on the final isolated run).
- Production build: `npm run build` — TypeScript and Vite passed; 363.40 kB JavaScript / 113.45 kB gzip. This is a build artifact size, not a performance improvement claim.
- `npm audit --audit-level=low` — zero vulnerabilities.
- First combined run: one existing bilingual UI test exceeded its 5 s limit while other suites were running. The complete frontend suite passed when run without simultaneous browser/backend suites; no timeout or assertion was relaxed.
- Targeted coverage includes family-aware SQL GET/POST filtering, directional conflict rejection, unchanged raw tags, legacy preference reads, rejected-write preservation, account isolation, parent-exclusion protection against a controlled provider response, and gameplay/evidence ordering.
- New real-API browser cases edit opposing family conditions, exclude a cooperative wishlist game, save preferences, refresh, switch languages, and confirm that the private library still contains the game. Existing draft, uncertain-write recovery, cross-tab account, collection-deletion, cache and return-state checks remain in the suite.

The live paid DeepSeek service, external-network latency and genuine player satisfaction were not evaluated. No performance speedup is claimed for this round. The catalog remains incomplete as a mode taxonomy, and synthetic market values remain explicitly marked.

- Final `npm run test:e2e`: **26/26 passed**, desktop 1440×1000 and mobile 375×812, 2.7 minutes. The previously failing desktop save-and-return journey passes. Screenshot: [mobile preference controls](../screenshots/tag-families-mobile-zh.png).

## Computer Use on the production build

Used the in-app browser with the compiled Vite preview at `127.0.0.1:4191`, actual FastAPI at `127.0.0.1:8011`, and owned schema `gdl_e2e_2a849aaafae84b8dad2337f8cd4483be`. Created only a temporary `example.test` account through the visible form. Rules-only configuration, no API request mocking. Desktop default 1280×720; mobile override verified from the rendered page as 375×812 with document width 360, no horizontal overflow. The viewport override was reset afterwards.

| Task | Observed result |
| --- | --- |
| New player, English | Home → Enter as player opens general discovery; search is an explicit action. |
| Search `FPS without multiplayer` | Exactly Half-Life: Alyx and MULLET MADJACK. Adding required Co-op removes excluded Multiplayer and shows three cooperative FPS titles; adding excluded Multiplayer again removes required Co-op and restores two results. No additional search interpretation request for these manual edits. |
| Profile conflict resolution | Select preferred Co-op, then avoided Multiplayer: the Co-op chip disappears. Add preferred Puzzle and save: confirmed status appears; Save becomes disabled. Discover navigation succeeds without a false unsaved-change prompt. |
| Returning player | Reload, reopen profile: preferred Puzzle and avoided Multiplayer still present. Recommendations show Puzzle-backed reasons and exclude known cooperative candidates. |
| Gameplay evidence | Clear explicit preferences, search Ori and the Will of the Wisps, click Like and return to recommendations. Hollow Knight / ANIMAL WELL cite Metroidvania; Split Fiction / Celeste / PICO PARK / Human Fall Flat cite Platformer. English and Chinese reasons agree. |
| Mobile Chinese, search and error recovery | `FPS不要多人` gives the same two titles. `合作但不要多人` reports “必选类型与排除范围冲突，请修改搜索条件。” Correcting to `找剧情游戏但不要恐怖` succeeds with nine titles and Horror + Survival Horror exclusion chips. |
| Mobile Chinese, save and revisit | Add avoided Multiplayer, save: “偏好已保存” appears next to the action. Returning to Discover preserves the existing explicit search, as designed; use “返回推荐” to view the updated feed. Split Fiction, PICO PARK and Human Fall Flat leave the recommended set. The Ori like remains, and reload preserves the same six recommendations. |

Evidence: [English search](../screenshots/tag-search-cu-en.jpg), [Chinese recommendations](../screenshots/recommendations-cu-zh.jpg), [mobile Chinese search](../screenshots/tag-search-cu-mobile-zh.jpg), [mobile confirmed save](../screenshots/tag-preferences-cu-mobile-zh.jpg), [final recommendation view](../screenshots/recommendations-cu-final-zh.jpg).

[Sanitized API access-log sequence](tag-semantics-cu-network-2026-10-29.json): 63 entries including CORS preflights; five submitted searches (four 200, one expected 422), three preference PUTs (200), one Ori affinity PATCH (200), and two refresh-session checks (200). It includes no credentials, bearer tokens or request bodies. Public details are cached within a page session; intentional reloads read them again. This is task evidence, not a controlled latency benchmark. Browser console inspection returned no warnings/errors.

Usability observations: conditions remain visible as removable chips, edits update the list without another Run Search, saving gives adjacent feedback, and results distinguish inferred gameplay reasons from explicit preferences. Mobile controls and long reasons wrap without horizontal overflow. The existing nine-result explicit search remained intact on profile return; the visible Back to recommendations action made the route distinction clear. No new visual redesign or developer-only banner was added.

Limitations: absence of a Multiplayer/Co-op tag cannot prove a game has no multiplayer mode. The recommendation list is therefore filtered against this documented catalog taxonomy, not an independently complete feature inventory. Manual checks cover the normal paths and changed semantics; account expiry, cross-tab changes, uncertain writes and deletion recovery were rerun in the real-API automated suite, not re-performed manually in this round.

After verification, the owned Computer Use schema was dropped, the temporary browser tab was closed, and the frontend, API and local PostgreSQL test server were stopped. The test-cluster directory was retained; the application database was not touched.
