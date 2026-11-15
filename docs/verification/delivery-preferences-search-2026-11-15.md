# Delivery, preference concurrency and search correctness — 2026-11-15

## Scope and baseline

Reviewed and changed from `5af5830a34df027be6a1880183370165e1211713` on `main`, with an initially clean working tree. The order was packaged delivery, preference concurrency, then search correctness. No authentication redesign, recommendation-weight changes, public comments or visual redesign were made. Existing account guards, library navigation memory, notes protection, public-detail caching, bilingual UI and mobile layout remain in place.

## Reproduced findings and changes

| Area | Actual evidence before the fix | Result |
| --- | --- | --- |
| Docker | The previously suspected missing `catalog/tag-families.json` **did not reproduce**. The baseline image built, imported the app, migrated, seeded and served 80 games. Docker's `!catalog/` already included its descendants. | Made the two runtime JSON inclusions explicit and added an independent packaged-delivery CI job. This is a verification improvement, not a claim that a missing-file startup crash was repaired. |
| Preferences | Two requests based on an old view both returned 200; the later stale write replaced the more recent choices. | Reads expose a version; writes require `expectedVersion`. Atomic insert/update permits one winner and rejects stale writes with 409. Owner still comes from the bearer token. |
| Preference feedback | The first browser regression found a failed write left the button saying “Saving…”. Computer Use then found the failure/reload feedback was above the viewport while the player was editing near the bottom. | Saving text reflects an active request only. Failure feedback and “Reload preferences” now appear next to the preference form, in both languages. |
| Chinese search | Both parsers read `第一` inside `第一人称射击` as an ordinal, and added nested type constraints. `自由建造` required Building and Crafting and returned zero games; `生存恐怖` also added unwanted nested constraints. | Consume complete type phrases longest first, before ranking. The fixed 80-game catalog returns 8 FPS, 4 Building and 5 Survival Horror games. Separately stated types still combine as conditions. |
| Search order | A real PostgreSQL response and local TypeScript filtering disagreed at position 40 in the full catalog: `Noita` versus `No Man's Sky`. Reload could therefore reorder the same results. | Search uses PostgreSQL `C` collation and equivalent Unicode code-point title comparison, including tied numeric scores. Library sorting and recommendation ranking are unchanged. |

## Behavior and compatibility

- Clean preference forms follow refreshed server values. Dirty forms retain their original version and both unsaved lists. The conflict view shows the latest saved lists, with **Use saved preferences** or **Keep my choices**. Keeping choices only rebases the draft; the player must explicitly save to replace both lists. There is no automatic union or replay.
- After an uncertain write, editing stays locked until a read succeeds. A successful write with a lost response is reconciled when its stored choices match the draft. A failed write before reaching the API leaves the draft available to save after reload.
- Drafts are account-scoped, tab-memory-only. Expiry hides the editor, another account cannot see the draft, and logging back into the original account restores it. Closing/reloading the page still ends unsaved draft memory, as before.
- Migration `0006_preference_version` preserves existing choices and initializes their version to 1. Missing preferences read as version 0. Existing databases need `alembic upgrade head`; older browser clients must reload because writes without `expectedVersion` now return 422. No existing user database was reseeded for this work.
- Legacy browser-demo preferences remain readable and gain a version on their next write. Demo writes use an account-specific Web Lock where supported. Without Web Locks, browser storage cannot promise the same cross-tab atomicity as PostgreSQL; the real API is the authoritative concurrency implementation.
- Shared `tests/fixtures/search-phrases.json` checks complete phrases, genuine ordinals, quoted titles, exclusions, separate positive conditions, unsupported exclusions and exact ordered IDs. Frontend tests also serialize/restore search URL state. Ordering cases include case, accents and supplementary Unicode characters.

## Executed checks

Environment: Windows desktop; Node 24.22.0; local Python 3.12.7; Docker 28.5.1; PostgreSQL 16.14. A newly created disposable database container hosted UUID-named test schemas. The packaged check allocated a separate disposable database/network. No application database was cleared or reseeded; AI was disabled/rules-only throughout.

| Check | Result |
| --- | --- |
| Full backend suite with PostgreSQL enabled | 123 passed in 59.589 seconds; database suites were not skipped |
| Final full frontend suite | 310 passed across 27 files in 52.87 seconds |
| Production TypeScript/Vite build | Passed, including the final packaged check |
| Frontend dependency audit, all dependency classes | 0 vulnerabilities |
| Packaged Docker + built frontend journey | Passed; browser journey 1/1, 9.2 seconds total |
| Full real-API browser suite, desktop and mobile | 38 passed in 3.2 minutes |

The packaged check builds the actual image, imports the app, verifies the bundled catalog and non-sensitive runtime authentication/admin/AI configuration sentinels, and asserts that environment files are absent from `/workspace`. It runs migrations and seed inside that image, reads the catalog through HTTP, builds the frontend and uses Vite preview for registration → search → personal record/note save → reload. It makes no model request. CI now runs this **Packaged Delivery Smoke** alongside the existing three jobs.

Backend concurrency tests synchronize two real requests to the same missing/existing preference row: one succeeds, one receives 409. Other cases cover a missing version, stale versions, forged owner parameters and migration preservation of legacy choices. UI tests cover the 409 path even when a storage refresh has not arrived, draft decisions, clean refreshes, rejected/unknown writes and reconciliation without replay. The first full browser run was 37/38; the failed assertion exposed the incorrect “Saving…” label described above, which was corrected before the final run.

## Computer Use: real player tasks

Used the in-app browser with the production frontend build on port 4191 and the real FastAPI/seeded PostgreSQL service behind a loopback fault proxy on ports 8011/8012. Actions were performed through visible forms and controls. The proxy only changed delivery of preference requests; it did not mock successful API/database results. Desktop tasks used an actual 1280×720 viewport. For the mobile tasks, the visible browser viewport was verified at 375×812, with content width 360 and no horizontal overflow. An initially hidden browser did not apply its requested viewport; its earlier screenshot is explicitly treated as desktop evidence.

| Task | Actions and observed outcome |
| --- | --- |
| New player, desktop English | Registered through the UI and opened the profile. Two tabs used the same account. A clean first tab received the second tab's saved Horror exclusion and had no unsaved-change state. |
| Dirty form versus another tab | First tab added Puzzle without saving; second tab saved Action. First tab showed both the retained Puzzle draft and latest Action/Horror lists, with Save disabled. **Keep my choices** made no request; explicit Save persisted the reviewed replacement and the second tab reflected it. |
| Offline save, Chinese | The first attempt revealed remote feedback placement. After the inline-feedback fix and rebuild, the mobile player added Racing, saved while the proxy dropped the write before forwarding, and saw the inline failure plus **重新加载偏好**. Returning online and reloading preserved Racing; explicit Save succeeded. |
| Committed write, lost response | Added Co-op; the real API committed successfully, then the proxy dropped its response. The UI did not show success or replay the write. **重新加载偏好** recovered the stored choices and cleared the dirty state. |
| Expiry and account isolation | Added an unsaved Atmospheric preference, advanced the isolated test server's clock, and received a real 401 on Save. The UI offered login and hid the draft. Registering another player in the second tab produced empty choices in the first, with no original draft. Logging back into the original account restored Atmospheric with a short review-before-save message; explicit Save succeeded. |
| Search and reload, mobile Chinese | `第一人称射击` returned 8 games, in the same order after reload. `自由建造` returned House Flipper, Manor Lords, Oxygen Not Included and Tiny Glade; selected Tiny Glade. **Show all games** returned 80, with No Man's Sky before Noita; reload retained the exact full order. |

Screenshots:

- [Desktop conflict, English](../screenshots/preferences-conflict-cu-en-2026-11-15.jpg)
- [Before fix: failure feedback outside the desktop editing viewport](../screenshots/preferences-offline-before-cu-2026-11-15.jpg)
- [After fix: mobile Chinese failure and recovery](../screenshots/preferences-offline-cu-zh-2026-11-15.jpg)
- [Original-account draft restored, mobile Chinese](../screenshots/preferences-restored-cu-zh-2026-11-15.jpg)
- [Building search and selected game, mobile Chinese](../screenshots/search-building-cu-zh-2026-11-15.jpg)

[Sanitized network evidence](delivery-preferences-search-cu-network-2026-11-15.jsonl) contains UTC time, method, path (no query) and status only: no request/response bodies, tokens, headers, emails or user IDs. There are 141 requests including OPTIONS, three explicit search POSTs, and ten preference PUT attempts: six confirmed 200, two dropped before forwarding, one committed response lost, and one 401. After the lost response at 13:13:32 UTC, no PUT occurred until the player's next intentional save at 13:14:02, which exercised expiry. Search refreshes made no additional POST `/api/search`. Counts describe this sequence only; they are not a cold/warm latency benchmark.

## Limits

- Computer Use exercised proactive conflict discovery; server-side simultaneous-write rejection and the late-event 409 path were verified by integration/UI tests. It did not manually synchronize two mouse clicks at the database boundary.
- Mobile validation used a Chromium viewport, not physical iOS/Android hardware. No fresh blanket assertion of zero console errors is made.
- No paid DeepSeek call, Steam collection, recommendation-quality study, production deployment, broad architecture change or performance claim is included.
- Disposable test containers, task servers and browser tabs are removed/stopped after validation. Historical screenshots overwritten by the existing browser suite are restored; this run's evidence has its own dated filenames.
