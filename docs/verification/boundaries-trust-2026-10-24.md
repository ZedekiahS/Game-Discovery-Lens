# Session, input and evidence boundaries — 2026-10-24

## Scope and baseline

Review baseline: `86a07370dc59f126541a7010f7694c86a7fe467e`. At the start, `git fetch` confirmed local `HEAD` and `origin/main` both pointed there; the working tree was clean. No later fix could be skipped. No repository/ancestor AGENTS file was found; the supplied customer-facing UI instructions were applied. README, architecture, backend setup and prior API/library/quick-preference verification records were read first.

This pass keeps the 80-game catalog, quick preferences, library sorting/return state, public detail cache, batched collection reads, bilingual UI and mobile layout. It adds no public comments, provider evaluation, new search semantics, database migration or architecture replacement.

## Findings and changes

| Risk | Evidence at baseline | Result |
| --- | --- | --- |
| A view can write into B after another tab signs in | **Reproduced with Computer Use and real API.** Both tabs restored A; tab 2 changed to B; tab 1 still showed A. Liking Ready or Not in tab 1 appeared in B after refresh. Before screenshots below. | Verified user/token/version are one session. Private request guards reject a mismatched owner/session before fetch, even without a storage event. Cross-tab changes invalidate the old view. |
| Old success/error can apply after a new login | Source review plus controlled delayed-response regression; not represented as a separately observed manual incident. | Validate session again after response; generation checks still isolate UI state. Old 401 cannot expire a newer account. A failed pending login also checks storage before changing the view. |
| Expiry removes unsaved account drafts | Source review of keyed remounts; exercised after repair through a real expired token. | Tab-memory drafts are keyed by API/mode, owner and field. Only the original owner restores them; no automatic submission. Save or confirmed discard clears them. |
| Offline/503 verification clears login | Existing behavior already retained credentials; kept and reverified. | Explicit account retry recovers without typing credentials. A 401 gives a sign-in path. |
| Deleted folder leaves the main library filtering a nonexistent ID | Source-level finding; after-fix real API CU and browser regression. | Once refreshed collection state is valid, clear the removed filter, show all collections and explain the change. Records/notes are not removed. |
| Docker does not pass the documented auth/admin/AI settings | Baseline Compose source/config inspection; native root `.env` reading was already correct. No live-container reproduction. | Explicit runtime forwarding, including AI fallback/timeout/provider and auth TTL. Nested environment files are excluded from build context. |
| Input lengths fall through to the DB or are accepted without bounds | API regression red run: overlong collection/display fields reached DB truncation; oversized password/search were accepted. | Pydantic bounds produce 4xx; HTML bounds and demo adapter agree. Validation rendering includes field/message, never echoed input values. |
| Non-ASCII token signature crashes verification | Real request with raw non-ASCII authorization bytes raised `TypeError` in baseline. Signed non-object payloads were also tested. | Malformed/non-ASCII/oversized token returns ordinary 401, no uncaught verifier exception. |
| Query-then-insert races | Barrier-controlled PostgreSQL tests reproduced save `[201,500]`, collection `[500,201]`; the original registration handler was separately loaded from the baseline commit and reproduced `[201,500]`. | Duplicate save/create returns one existing row; registration gives `[201,409]`; rename conflict gives 409. Default-folder creation race also converges. |
| Claims about common praise or validated demand have no review corpus | Direct text/contract inspection, not a model-quality experiment. | EN/ZH describe catalog/editorial evidence and absence of review text. No market-demand validation claim. |
| Seed metrics look real in API mode; source metadata disappears | Catalog-to-API mapping inspection and full 80-record contract regression. | Details show gameplay URL/date/scope and separate synthetic-metric disclosure. No fabricated source or unknown-as-zero fallback. |

Registration concurrency was synchronized before hashing, after the initial lookup. An earlier INSERT-only barrier caused an artificial lock timeout because registration also inserts its default collection; it was corrected and is not counted as a product failure. The focused tests use the actual routes and PostgreSQL unique constraints.

## User-visible behavior and limits

- Account changes close/hide the previous private view immediately. Requests capture the verified owner and token together; the backend continues to determine owner from the token alone.
- A response arriving after account change is ignored for the new view. A write already committed on the server cannot be reversed by frontend cancellation. Unconfirmed saves lock further edits until a read reconciliation; the action is labelled **Reload library / 重新加载游戏库**. The user must explicitly save again if desired.
- Unsaved game notes, preferences and collection-name drafts survive account/expiry transitions **only in the same tab's memory**. Another account cannot read or submit them. Reloading/closing the tab ends recovery. Explicitly confirming discard removes the draft, including on navigation. Passwords/tokens are never stored in the draft map.
- Email ≤255, display name ≤120, password 8–128, collection name 1–120 (nonblank), description ≤500 and search ≤500 characters. Blank search retains existing browsing behavior. Errors preserve form input.
- `contentSource` is additive and optional. API source mapping requires matching ID/name/summary/tags; metric classification separately requires all five numeric values and name to match the bundled catalog. Modified or unknown data has no inherited source and `metricsKind: unknown`. This is a conservative compatibility bridge, not a new provenance database. No current user data was reseeded.
- Price, rating, review count, ownership and revenue remain synthetic demonstration values in demo **and seeded API** mode. Gameplay links and the recorded `2026-10-08` check date apply only to summaries/editorial tags; sources were not freshly rechecked this round. Empty collection aggregates return null. Existing nonempty numeric values are preserved.

## Computer Use with real local API

Environment: Windows, Node 24.22.0, production Vite build/preview on loopback 4191, FastAPI on 8012 through a loopback fault proxy on 8011, PostgreSQL 18 on 55437, 80 seeded games, AI disabled/rules only. Only UUID test schemas were used. Test accounts used synthetic `example.test` addresses. No main schema was cleared and no real user data or paid-provider requests were involved.

Computer Use operated the page controls via the in-app browser. Fault injection was confined to the test harness: a clock offset made the real token verifier expire tokens; the proxy dropped writes before forwarding or returned 503 on account reads. It did not bypass production authentication or add a production debug route.

| Task | Actual steps / observed state | Evidence |
| --- | --- | --- |
| Baseline two-tab incident | Register A; restore A in tab 2; sign out/register B there; click Like in unchanged A tab; B refresh shows that like. | [A before](../screenshots/boundary-before-account-a.png), [B before](../screenshots/boundary-before-account-b.png) |
| New player, desktop EN | Register fresh A; enter recommended game; open Track this game; enter a private note draft. | [Restored draft](../screenshots/boundary-restored-draft-en.png) |
| Two-tab isolation | Second tab changes A→B. First tab shows B, closes editor and has zero records. Second tab signs back into A; first tab restores the original draft without sending a write. | [B after](../screenshots/boundary-after-account-b.png), [A draft](../screenshots/boundary-restored-draft-en.png) |
| Real token expiry | Advance test auth clock; click Save record; PUT returns 401, editor hides and sign-in path appears. Restore clock and sign in A; original draft returns, unsaved. | [Expiry](../screenshots/boundary-expired-en.png), network `12:23:14Z` |
| Save while disconnected | Drop PUT before forwarding; save remains unconfirmed, draft stays, saving disabled. Restore connection; reload reads, draft remains; explicit save succeeds. | [Offline draft](../screenshots/boundary-offline-draft-en.png), network `12:23:52Z` |
| Returning player | Refresh after explicit save; A and the record restore. Set Playing/Like, save Chinese note. | [Library](../screenshots/boundary-deleted-filter-zh.png) |
| Delete filtered collection, ZH | Create 周末清单, filter library to it, confirm deletion. Filter becomes 全部收藏夹, explanatory notice appears, game record and note remain. | [Deleted filter](../screenshots/boundary-deleted-filter-zh.png) |
| Temporary 503 | Reload while `/auth/me` returns 503; UI retains credentials and offers retry. Restore service and retry; A/record return without password. | Network `12:26:28Z` then `12:26:43Z` |
| Data basis, ZH | Open game details disclosure; inspect official gameplay link, check date, scope, synthetic metrics and no-review-text statement. | [Provenance](../screenshots/boundary-provenance-zh.png) |

[Sanitized network evidence](boundaries-network.jsonl) records timestamps/method/path/status or connection outcome, never credentials, headers or bodies. Query strings are omitted in this CU log. The offline screenshot predates the final wording improvement from “Retry” to “Reload library”; final label is asserted by the browser regression.

**Computer Use limitation:** the tool accepted a requested 375×812 viewport but existing and new tabs still reported/rendered 1280×720. Therefore all CU observations above are desktop EN/ZH, not a claimed phone test. The separate Playwright mobile project uses actual 375×812 touch/mobile emulation and verifies Chinese library/provenance with no horizontal overflow. It is automated browser evidence, not CU phone evidence. No physical mobile device, Safari/WebKit or Firefox test was performed.

## Automated checks

Executed locally: **223/223 frontend tests**, **106/106 backend tests** with PostgreSQL and no skips, TypeScript/production build, and `npm audit --audit-level=low` (**0 vulnerabilities**). Tests include delayed account responses, pre-storage-event guards, account-only drafts, explicit discard, 401/503 recovery, input bounds, malformed tokens, concurrent unique-key writes, catalog metadata, native/Compose config, prior ownership, cache and committed-write-response-loss behavior.

**20/20 Playwright + real API journeys passed** (10 desktop, 10 mobile, 1.4 minutes, no retries). These include all 12 pre-existing browser cases plus eight new boundary cases. Mobile Chinese screenshots: [library](../screenshots/boundary-mobile-library-zh.png), [sources](../screenshots/boundary-mobile-provenance-zh.png). Production output: JS 357.04 kB / gzip 111.11 kB, CSS 43.97 kB / gzip 9.36 kB. `git diff --check` passed.

The long JSDOM bilingual journey passed alone but exceeded its 5-second total budget under unrestricted parallel workers. Bounding Vitest to two workers made the full suite pass without increasing timeouts or weakening assertions. Initial browser failures were stale selectors for the new “Demo” price suffix and a source-scope sentence inside a larger paragraph; selectors were updated to the observed accessible content.

Configuration validation uses non-sensitive sentinel strings and boolean assertions; it never prints actual `.env` values. Compose configuration validation does not require an engine and passed locally. Docker Desktop's Linux engine was unavailable, so an image build/container boot was **not** verified. The CLI configuration check may skip on hosts without Docker; all other tests remain independent of it.

## Performance method

Before/after use the same Windows i7-10750H host, Node 24.22.0, Playwright 1.64.1's bundled Chromium 156.0.8078.4 (revision 1248), 80-game schema, rules-only API, production `npm run build` + `vite preview`, direct API on 8011 (no fault proxy), loopback without network/CPU throttling. Each viewport gets three fresh contexts; the API/DB process is warm. Desktop 1440×1000 and narrow 375×812 are measured independently. The narrow performance context is a viewport change, not device emulation. Browser work/test suites are not run concurrently with measurement.

The script records wall-clock action-to-observed-UI, not Core Web Vitals: first screen includes Playwright's 500 ms network-idle wait; search includes selection/detail arrival; a separate return to details uses the public cache. Save stops at confirmed feedback; library return stops when its card is visible. Counts include API requests issued during each interval, not static assets. Public cold reads are included in first-screen/search measurements. Three samples are a smoke baseline, not a statistically significant speed benchmark.

Raw measurements: [before](boundaries-performance-before.json), [after](boundaries-performance-after.json). Reproduce with `node scripts/measure-boundaries.mjs <output.json>` from `frontend/`, against an isolated `tests.serve_e2e` API and an already-built preview. The script creates only disposable test accounts and records no credentials.

No broad performance refactor was attempted. Existing public-cache and batched-private-read regressions remain required. Any small timing differences must be interpreted with local scheduling noise and the low sample count.

Median milliseconds (three samples per cell); API request counts are identical before/after. Ranges reflect asynchronous requests falling within the measured interval, not three differing implementations.

| Task | Desktop before → after | Narrow before → after | API requests desktop / narrow |
| --- | --- | --- | --- |
| First screen (includes idle wait) | 808 → 748 | 732 → 751 | 3 / 3 |
| Search + selected detail | 172 → 125 | 121 → 125 | 2–3 / 2 |
| Confirmed save feedback | 99 → 86 | 87 → 77 | 1–2 / 2 |
| Return to details | 68 → 61 | 50 → 65 | 1 / 1 |
| Return to library | 63 → 59 | 47 → 46 | 0 / 0 |

The measurements show preserved request counts and no obvious local latency regression. They do **not** demonstrate a general speed improvement; no optimization was justified by these small noisy differences.

The one request on detail return is the authenticated collection insight read; public game detail/insight reads remain cached. A delayed public insight read can land in the save interval, which explains its 1–2 count. The final acceptance/performance servers and temporary PostgreSQL cluster were stopped, and their two explicitly identified schemas were removed. The disposable cluster directory was retained; no main database or user directory was deleted.

## Remaining boundary

Unsaved drafts do not survive browser reload/close; no server draft store was introduced. Existing stateless tokens remain valid until expiry; cross-device revocation/account management is not part of this pass. The compatibility mapping cannot establish provenance for arbitrary edited/imported data. No review scraping, independent market data, paid AI evaluation or recommendation-quality claim was added. Editable search conditions, negation semantics and recommendation-quality evaluation are explicitly deferred to the next stage. This round stops after delivery and validation.
