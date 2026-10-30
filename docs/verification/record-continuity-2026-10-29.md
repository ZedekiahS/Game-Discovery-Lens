# Personal records, task continuity and library management — 2026-10-29

## Scope and baseline

Started at clean `9ba234bb6b1f715a738cbcedd61507c45c990952`; fetched `origin/main` matched. The preceding review and this implementation focus on existing personal records, navigation and library management. No public comments, architecture replacement, catalog expansion, paid model call or primary-database modification.

The repository had no applicable on-disk `AGENTS.md`. The supplied customer-facing UI instructions were followed: conflict/recovery messages appear at the affected operation; no test-environment banners or implementation explanations were added to product pages.

## Confirmed issues and changes

| Reproduced before the change | Resulting behavior |
| --- | --- |
| Two full saves of the same account/game both returned success; the later stale editor could erase a newer note. | Full saves and removals compare the editor's original `updatedAt` atomically in PostgreSQL. A stale write returns 409. The editor keeps its draft, shows the latest saved fields, and requires an explicit merge or acceptance of the saved record. |
| Refresh lost the applied search and selected result. | A validated, versioned URL value retains public applied conditions, query and selected game. Refresh/back restore those conditions locally without another search interpretation request. Unsubmitted text and private records never enter the URL. |
| Guest “Track this game” lost the selected game across sign-in. | The sign-in form opens, and successful sign-in continues into that game's editor. It does not automatically save a record. Cancelling or leaving clears the pending action. |
| The empty-filter recovery action opened the entire catalog instead of recovering the personal shelf. | “Clear filters” stays in the personal library. “Browse games” remains a separate action. Existing sorting and return-state behavior remain covered. |
| Multiplayer overview showed 22 while the same category returned 37 games. | Overview counts use the existing directional tag-family matching: 37 in both locations, without rewriting catalog tags. |
| The mobile library placed its first game below the initial viewport. | Compact mobile heading and two-column filter/sort controls bring the first card into the initial 375×812 view. The disclosure can further collapse filters. |

Library management also adds a “Not for me” shelf, search through personal notes, a visible note badge, and an accurate “Recorded” label for a note/preference without a play status. Undoing a dislike retains the note and play status.

## Record contract and failure semantics

- `PUT /api/me/games/{id}` requires `expectedUpdatedAt`: null means create only if absent; an existing edit echoes the exact timestamp from the loaded record. `DELETE` requires the timestamp query parameter. Missing preconditions return 422; stale existing versions return 409. Existing clients must update/reload alongside this release.
- The server still derives the owner from the verified bearer token. No schema migration is needed. Timestamp updates use `clock_timestamp()` and a one-microsecond monotonic lower bound, including quick preference PATCH requests. Do not round timestamps through JavaScript `Date` before echoing them.
- Targeted real-database concurrency tests use a barrier to start two creates or two edits: exactly one succeeds and one conflicts. Stale deletes and stale edits after a removal cannot erase or resurrect another version.
- Same-account tab notifications contain only an invalidation nonce. A storage event or focus refresh fetches records; the server precondition remains authoritative when those notifications are unavailable or late.
- Merging retains fields changed locally and uses the latest saved value for untouched fields. If both editors changed the same field, explicit merge retains the local field. The merged draft is shown for review and still requires Save.
- Validation failures remain editable. Unknown network/5xx results require a read before another write. No automatic write replay is performed. A dedicated UI regression covers a write committed successfully whose response was lost: reload recognizes the saved value, clears the dirty state and does not submit again.
- Demo storage uses a per-account Web Lock for record-list mutations where supported. The fallback cannot promise atomic cross-tab writes on browsers without Web Locks; real API writes use the database precondition.

## Executed checks

Local environment: Windows, Node 24.22.0, Python 3.12.7 and PostgreSQL 18. Local tests used an explicit disposable test database and independent UUID schemas. Paid AI was disabled.

| Check | Result |
| --- | --- |
| `python -m unittest discover -s backend/tests -t backend` with `GDL_TEST_DATABASE_URL` | 118 passed; PostgreSQL suites executed, no database skips; 37.64 s |
| `npm test` (final complete run, including lost-response regression) | 288 passed in 27 files; 41.91 s |
| `npm run test:e2e` | 32/32 passed; desktop 1440×1000 and mobile 375×812; 2.9 min |
| `npm run build` | TypeScript and production build passed; JS 371.46 kB / 116.14 kB gzip, CSS 45.58 kB / 9.63 kB gzip |
| `npm audit --audit-level=low` | Zero vulnerabilities |
| `git diff --check` | Passed before commit |

The browser suite retains session/account isolation, expired-session draft recovery, offline save recovery, collection deletion, quick preferences, cache/request-count and bilingual journeys. Six new browser cases (three tasks on two viewports) cover tracking after login, same-account conflict merging, search restoration, note search, dislike reversal and overview count agreement.

Intermediate failures were not suppressed: the old refresh-reset expectations were intentionally updated to the new persistence requirement. New browser locators using exact label matching failed once controls contained values/options; semantic textbox/combobox roles fixed those locators. A parallel-load frontend run hit the existing five-second test timeout; the final isolated complete run passed without increasing it. Historical screenshots overwritten by existing browser tests were restored from the initial commit; new evidence has distinct filenames.

## Computer Use, real API

The in-app browser used the production Vite preview, actual FastAPI and an isolated PostgreSQL schema, with the shared 80-game catalog. Desktop English used the default 1280×720 viewport; mobile Chinese used 375×812 viewport emulation. This was not a physical-phone test. All normal actions below were performed through the browser UI. A local loopback proxy only injected the stated network failure and wrote sanitized request evidence; the test server's existing clock control expired the token.

| Task and actual steps | Observed result / evidence |
| --- | --- |
| Create a test player, sign out, search “Hades under 30”, choose Track, sign in. | Sign-in appeared automatically and continued into Hades' editor. Explicit Save created the first record. |
| First tab edits play status; second tab saves a newer note. | First tab shows the newer note beside its retained draft and disables Save. [Conflict screenshot](../screenshots/record-conflict-cu-en.jpg). |
| Choose Merge my changes, inspect draft, Save; reload second tab. | Newer note and first tab's Playing status both remain. No write occurs merely from choosing Merge. |
| Mobile Chinese: search part of the note, mark Not for me, filter that shelf, type an unmatched search, Clear filters. | The one-game personal shelf returns; it does not become the 80-game catalog. [Library screenshot](../screenshots/record-library-cu-zh.jpg). |
| Change dislike back to undecided, edit a note; disconnect write forwarding; Save. | One disconnected PUT, explicit “cannot confirm” feedback, retained draft and disabled Save. [Offline screenshot](../screenshots/record-offline-cu-zh.jpg). |
| Restore network, Reload library, inspect draft, explicitly Save. | GETs precede the next PUT; note retained and dislike removed. No automatic repeated write. |
| Search result Hades → Hades II → refresh → browser Back. | Query and price/title conditions survive refresh with Hades II selected; Back restores Hades. [Restoration screenshot](../screenshots/record-search-restore-cu-en.jpg). |
| Developer overview → Research Multiplayer. | Card shows 37 games and result list shows 37 results. [Count screenshot](../screenshots/record-genre-count-cu-en.jpg). |
| Edit another note, expire the token, Save, restore clock, sign in to the original account. | PUT returns 401; explicit login path appears. Re-login restores the private draft and requires an explicit Save. [Restored draft screenshot](../screenshots/record-draft-restored-cu-zh.jpg). |

The desktop console had no warning/error entries during the normal search/count task. A stale test token at the initial preview opening returned 401 as expected and was cleared before creating this run's test account. During the refresh check, the other tab's saved Chinese language preference was correctly applied; the English-only locator was updated after observing that state. No product bug was inferred from these locator mismatches.

## Request and layout evidence

[Sanitized proxy trace](record-continuity-cu-network-2026-10-29.jsonl) contains 91 requests including CORS preflights across the whole session. It stores only UTC time, method, path without query, and status—no tokens, passwords, request/response bodies or user identifiers. The local session ran October 29 evening (UTC timestamps are October 30).

- Exactly one `POST /api/search` across initial search, selection, refresh, Back and the overview drilldown. The browser regression independently asserts the same count.
- Conflict demonstration: second-tab PUT at 01:15:31 UTC → first-tab GET → explicit merged PUT at 01:15:42. Computer Use exercised proactive conflict discovery; the 409 path was exercised by backend and frontend regressions.
- Offline task: disconnected PUT at 01:16:37 → explicit reload GETs at 01:16:50 → explicit successful PUT. Expiry task: PUT 401 at 01:18:21 → login → record reads → explicit successful PUT at 01:18:38.
- After a full reload the in-memory public cache is cold; detail GETs still occur. This round does not claim all repeated GETs are eliminated or make a latency improvement claim.
- In the mobile Chinese shelf before a success notice, the first card started at document y=707.59 px; viewport width was 375 px and document content width 360 px, with no horizontal overflow. The earlier review observed approximately y=830 before compaction. These are layout observations, not a controlled performance benchmark. The retained screenshot includes a success notice, which adds height.

## Limits and cleanup

Unsaved private drafts remain account-scoped tab memory: they survive session expiry/re-login in that tab, but not an accepted page reload or tab closure. This round versions game records, not the separate whole-profile preferences endpoint. A complete screen-reader audit, physical mobile-device test and a new cold/warm latency benchmark were not performed. Bulk library editing was not added.

Computer Use test accounts and records existed only in this task's disposable schema. After evidence capture, the four schemas created by this task's browser/test runs were dropped by exact name; all pre-existing schemas remained. The task's preview, proxy, API and test PostgreSQL server were stopped; ports 4191, 8011, 8012 and 55437 were no longer listening. Temporary tabs were closed and the viewport override reset.

The unchanged GitHub workflow runs backend tests with PostgreSQL 16/Python 3.11, frontend tests/audit/build with Node 24, and real-API Chromium browser journeys on each push to `main`. The delivery response records the run result for the uploaded commit.
