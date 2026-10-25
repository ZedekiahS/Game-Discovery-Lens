# Editable search, negative types and recommendation evaluation — 2026-10-25

## Baseline and scope

At the start, local HEAD and fetched `origin/main` both pointed to `b932ec8a87841dc66e28a75acf468bc2b518ffbd`; the working tree was clean. README, architecture and the [previous boundary pass](boundaries-trust-2026-10-24.md) were read first. No repository/ancestor AGENTS file was found; the supplied customer-facing interface instructions apply. This is the next phase expressly deferred by that pass, authorized by the user's “可以下一轮了”.

This round adds editable search conditions, bounded bilingual type exclusions and a repeatable recommendation-quality diagnostic. It keeps the existing ranking algorithm, architecture, 80-game catalog, sessions, note protection, quick preferences and caches. No public comments, data collection, schema migration or paid provider call was added.

## Behavior and contract

- Every applied condition has a removable chip: title, budget, included/excluded types, rating, review-count condition, ordering and result range. The expanded filter panel edits the same fields. Controls stay folded by default, chips wrap and their buttons have keyboard labels and a minimum 44-pixel height.
- Changing conditions immediately filters the full loaded catalog; it does not call `/api/search` or a model. Selection and detail reads keep their existing behavior. A newer edit invalidates pending search responses. Clear conditions retains the text draft and displays all 80 catalog entries; Return to recommendations restores browsing. A short message explains that submitting the text again replaces manual edits.
- `excludedTags` is additive: older consumers may omit it; API responses default it to `[]`. Required tags are AND conditions, excluded tags are ANY-match exclusions. A manual selection of an opposite type removes the conflicting exact-tag condition.
- Known and quoted titles are protected before interpreting negation. Supported prefixes include `without`, `excluding`, `exclude`, `not`, `no`, `不要`, `不含`, `排除`, `非`, `不想玩` and `不想要`, followed by a known catalog type or supported alias. Lists can use `and`, `or`, `、`, `和` or `或`. General `horror` / `恐怖` excludes both Horror and Survival Horror when present; explicit Survival Horror is narrower.
- Unsupported negation such as `not free` / `不要免费`, and conflicting required/excluded types, produces an actionable error (HTTP 422). It preserves the query and previous confirmed results instead of silently reversing the meaning. Known `Ready or Not` remains a title. Ambiguous partial titles can be quoted.
- DeepSeek output is normalized as before. Recognized rules exclusions are retained even if a controlled provider response omits or reverses them; unsupported negation is rejected before requesting the provider. Provider coverage this round uses mocks only.

The missing editable chips and negation handling were identified from baseline code and parser checks, rather than a reported production incident. No baseline manual video is claimed. The after-change UI behavior below was exercised against the actual local API.

## Executed checks

| Check | Result |
| --- | --- |
| Frontend unit/UI suite | 26 files, **256 tests passed** |
| Backend suite with local PostgreSQL and isolated schemas | **110 tests passed**, no skips |
| Real API Playwright journeys | **24 passed**: 12 at 1440×1000 and 12 at 375×812 with mobile/touch options |
| TypeScript and production build | Passed; JS 361.71 kB (112.73 kB gzip), CSS 44.38 kB (9.43 kB gzip) |
| Dependency audit | **0 vulnerabilities** |
| Recommendation diagnostic | 11 scenarios, 8 relevance-scored, **0 invariant violations** |
| `git diff --check` | Passed |

The first browser run had 22 passes and two failures in a new test locator: the implicit-label select was visible with accessible name `Exclude type`, but `getByLabel(..., exact: true)` did not resolve it. Using its combobox role/name fixed the test; the complete 24-test rerun passed. This was not a product failure. A first local PostgreSQL startup omitted the explicit test port and failed to bind; restarting the same isolated cluster on 55437 succeeded.

New shared `tests/fixtures/search-negation.json` covers 12 successful bilingual queries with exact intents/results and six unsupported/conflicting expressions. Additional parser cases cover an empty tag set and both horror tags. PostgreSQL checks use the actual HTTP route and SQL filtering. Existing search fixtures remain intact. Regression coverage retains delayed search/insight rejection, account isolation, draft guards, uncertain-save reconciliation, collection deletion, library return state and request caching.

## Computer Use: production frontend and real local API

Setup: Windows host, Node 24.22, production `npm run build` then Vite preview at loopback 4191; real FastAPI at 8011, local PostgreSQL 18 on 55437, freshly migrated isolated schema `gdl_e2e_b8aeafc584b94c9ab7ba2d4a6d13b1c2`, fixed 80-game seed. AI is disabled with the rules provider. No normal application schema or user records were reset. The in-app browser reported 1280×720, with document width 1265 and no horizontal overflow. This is functional verification, not a new controlled speed benchmark.

Actual interactive sequence:

1. Open player discovery as a signed-out/new visitor. It starts on recommendations. Switch to English and open Search games.
2. Submit `FPS without multiplayer`. See Include FPS and Exclude Multiplayer chips and four catalog matches: Half-Life: Alyx, Left 4 Dead 2, MULLET MADJACK, Ready or Not.
3. Expand Filters and enter `MULLET` in Title contains: one result. Focus its Remove Title chip and press Enter: four results return.
4. Choose rating 4+, price descending, maximum 1 and start at result 2: MULLET MADJACK remains as the second matching result. Fold Filters and inspect the visible conditions and primary search action.
5. Expand and clear conditions: 80 results, original `FPS without multiplayer` text retained. Fold Filters.
6. Switch to Chinese, submit `不要免费`: a nearby actionable error appears and input is retained. Submit `找剧情游戏但不要恐怖`: the error disappears, both horror exclusions appear and nine matching titles return, beginning with Celeste. No console errors were captured.

API log evidence for that sequence, excluding CORS preflight: one `GET /api/games`; four distinct detail and insight pairs (initial Ready or Not, then Half-Life: Alyx, MULLET MADJACK and Celeste); exactly three `POST /api/search` responses **200 → 422 → 200**. There was no extra search request during all title/rating/sort/range edits or Clear. Automated browser assertions separately verify one search request through manual editing/clear and a second only after a new submitted query. This is request-count evidence, not a latency-improvement claim.

| English edited conditions (Computer Use) | Chinese recovery (Computer Use) |
| --- | --- |
| ![Edited conditions](../screenshots/search-cu-edited-en.png) | ![Corrected search](../screenshots/search-cu-recovered-zh.png) |

[Chinese error with retained input](../screenshots/search-cu-error-zh.png). [Expanded desktop conditions](../screenshots/search-edit-desktop-zh.png) and [expanded mobile conditions](../screenshots/search-edit-mobile-zh.png) are Playwright captures. Mobile Chinese editing, chip wrapping, no horizontal overflow and error recovery passed at 375×812. The Computer Use session was desktop-sized; no manual physical-phone or mobile Computer Use pass is claimed. The expanded mobile panel requires scrolling; it is folded initially to keep search/results prominent.

## Recommendation baseline

The [fixture](../../tests/fixtures/recommendation-scenarios.json) defines 11 authored scenarios before the first ranking run. Relevance IDs were selected editorially by the coding agent from the fixed catalog, not supplied by real users or independent raters. The [machine-readable report](../evaluations/recommendations-2026-10-25.json) contains each ranking, reasons, precision@6, binary nDCG@6 and unique primary-type counts.

Hard checks cover excluded/disliked/played games, known favorites versus wishlist, duplicate results, wishlist priority, evidence-backed reasons, input-order stability, research-collection isolation and duplicate personal collections. All 11 have zero violations.

| Relevance-scored scenario | Relevant results / 6 |
| --- | --- |
| Cozy evening | 6 / 6 |
| Puzzle discovery | 6 / 6 |
| Cooperative weekend | 6 / 6 |
| Wishlist first | 6 / 6 |
| Celeste fan | 4 / 6 |
| Space explorer | 4 / 6 |
| Personal collection containing Celeste | 4 / 6 |
| Avoided horror overrides wishlist | 6 / 6 |

Macro precision@6 across these eight is **0.875**, versus **0.125** for the existing popularity-only picks scored on the same labels. This is a diagnostic comparison biased toward explicit preference scenarios, not a before/after algorithm improvement or real-user accuracy. All lists here contain six entries. The space fixture defines only four relevant titles, so its precision@6 ceiling is 4/6 even when all relevant titles are retrieved; nDCG and the raw list should be read alongside it. Cold-start, research-only and duplicate-collection scenarios test behavior without assigning relevance scores.

The Celeste-based misses and broad Exploration matches remain visible in the report. No ranking weights, catalog tags or expected labels were tuned after seeing the output. Diversity is reported only as a diagnostic count, not treated as an independently validated quality measure.

Reproduce from `frontend/`:

```powershell
npm test
npm run build
node scripts/evaluate-recommendations.mjs
$env:GDL_E2E_DATABASE_URL = 'postgresql+psycopg://gdl_test@127.0.0.1:55437/gdl_test'
npm run test:e2e
```

The test database must already exist. Backend verification uses `GDL_TEST_DATABASE_URL` and `backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -t backend` from the repository root; suites create/drop isolated UUID schemas.

## Limits and stopping point

Exclusion matches catalog tags. For example, some cooperative games lack the Multiplayer tag and remain in `without multiplayer`; this is not proof that they have no multiplayer mode. The UI chips accurately show the tags applied. No taxonomy completion, arbitrary Boolean expressions, negative-price filter, review crawling, live model evaluation, user study or production load test was performed. Current synthetic metrics and provenance disclosures remain in force.

Account-heavy tasks were rechecked by the full real API browser regression, rather than repeated manually in this Computer Use session. Existing auth, draft and cache unit/integration checks also pass. This round stops at these changes and their verification; it does not automatically expand the roadmap.
