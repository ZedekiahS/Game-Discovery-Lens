# Quick preferences, library navigation and request reuse

## Scope

- Quick Like / Want to play / Not for me actions update one private record field without overwriting notes. Pressing an active action reverses it; Like and Not for me are mutually exclusive. Current selection stays visible after re-ranking.
- Library sorting: latest activity, latest collection, title. Search, shelf, folder, sorting, add-games mode and scroll position survive route navigation within the same account/workspace session. Full reload resets navigation memory, not saved data.
- A single owned-membership read hydrates all collection folders. Public details/insights reuse in-flight and recent requests for 60 seconds; explicit Retry and catalog reload invalidate that reuse. Hidden collection insight panels do not fetch.

## Automated verification

- Frontend unit/component suite: 216 tests in 25 files passed.
- Backend suite against a fresh isolated PostgreSQL 18 database: 96 tests passed, including migrations, ownership, PATCH field preservation/validation and bulk collection reads. The previously retained temporary cluster had missing PostgreSQL system files; it was stopped and left untouched, and all checks were rerun on the fresh cluster.
- Production TypeScript/Vite build passed on Node 24.
- Pre-push audit found newly published development-tool advisories. Updated Vite 6.4.3 to 6.4.5 and Vitest 4.1.11 to 4.1.12 within their existing major versions; the install audit then reported zero vulnerabilities. Relevant upstream advisories: [Vite middleware](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [Vite file access](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [Vitest mock registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [Vitest Windows paths](https://github.com/advisories/GHSA-xp26-3454-mjgp). Frontend tests, build and browser journeys were rerun after these updates.
- All 12 desktop/mobile real-API browser journeys passed. Added checks cover minimal PATCH payloads, note retention, single bulk collection hydration, repeat detail/insight request reuse, library filter restoration, 80-title sorting, browser Back scroll restoration and sign-out isolation.
- Unit coverage also checks failed writes/reload, duplicate taps, expired and rejected cache entries, no shared account-data cache, stable demo timestamps and legacy saves with unknown dates.

## Computer Use review

Used the official in-app browser against a real local API and disposable PostgreSQL schema. This was a separate manual interaction pass, not a description of the automated browser suite. Account and note values were synthetic test data. AI was disabled for these checks; insight results used the rules provider.

Completed in English at 1440 × 1000 and Chinese at 375 × 812:

1. Enter as player, register and sign in, like a featured game and mark it Want to play. Verify persisted pressed states and inline confirmation.
2. Open its game record, save a Chinese note, return and select Not for me. Reopen the record and verify the exact note and Want to play state remain intact.
3. Search the library, choose the Want to play shelf and title sorting, visit the profile, then use browser Back. Verify the original search, shelf and sorting are restored.
4. Open Add games, sort the full 80-game catalog by title, open and close Celeste, navigate from the bottom-of-list profile link, then use browser Back. Verify return to the bottom of the list, with all 80 games and no unexpectedly reopened editor.
5. Inspect mobile controls and page hierarchy. No warning/error entries were reported by the browser console during this pass.

Observed and corrected during the review:

- The large signed-in account card competed with the library heading. Library/profile pages now show a compact account row while retaining the existing sign-out draft protection.
- Inactive quick actions looked too similar to active ones. Inactive actions now have a neutral background; active states retain the accent border/color.
- Stacked mobile selects pushed game cards farther down. Collection and sort controls now share one row, below the full-width search field.

Evidence captured through Computer Use:

- [Desktop library, English](../screenshots/library-quick-actions-desktop-en.png)
- [Mobile library, Chinese](../screenshots/library-quick-actions-mobile-zh.png)

## Limits

This verifies observable behavior and request reuse on the fixed 80-game catalog; it does not establish live-player usability results or a performance percentile. No public commenting/social system, remote production database, paid DeepSeek call or external account provider was added.
