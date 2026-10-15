# Game Discovery Lens Frontend

React + TypeScript portfolio application with explicit fixed-data and API modes.

## Run

From `frontend/`:

```powershell
npm ci
npm run dev
```

Open [the demo](http://localhost:5173/?mode=demo). Demo is the default when no mode is configured.

## Data Modes

| Mode | Data and saves | Accounts and AI |
| --- | --- | --- |
| `?mode=demo` | Bundled 80-game catalog; collections, play records, and preferences stay in this browser. No backend requests. | No server account is created. Search and insight panels use local sample/rule logic. |
| `?mode=api` | FastAPI catalog and PostgreSQL saves, play records, and preferences. API failures are shown and can be retried. | Register or sign in to access personal data. Search uses the backend rules or configured AI provider. |

API mode never changes a failed API request into a local save or sample-data success. Account collections and browser-demo collections are separate. Switching modes loads the page again. Invalid or expired authentication requires signing in again.

To set the default mode or a different API URL, copy `.env.example` to `.env.local` in this directory and edit it:

```env
VITE_DATA_MODE=demo
VITE_API_BASE_URL=http://localhost:8000/api
```

`?mode=demo` and `?mode=api` override `VITE_DATA_MODE`. These are application data modes, independent of Vite's development/production build modes. Restart the development server after changing environment files; rebuild to update a static bundle. This Vite project loads its environment from `frontend/`, so the repository root `.env` configures the backend, not these frontend settings. See [Vite's environment documentation](https://vite.dev/guide/env-and-mode).

Use [the backend setup instructions](../backend/README.md) before opening [API mode](http://localhost:5173/?mode=api). AI provider keys belong only in the backend environment. The existing search provider and game/collection insight interfaces are retained; the collection reliability tests do not call a paid provider.

## Search Behavior

Search combines a case-insensitive, literal title match with every requested filter using AND. For example, `Celeste Story Rich under $20.99` requires a matching title, the Story Rich tag, and a price no higher than $20.99. Decimal budgets are retained. The shared intent uses `titleQuery: null` when no title is requested and `maxPrice: null` when no price limit is requested; an empty parsed query matches the catalog without an implicit budget. In either interface, submitting blank input returns to its default browsing page without making a search request.

Unknown titles return no results. Unrecognized words remain part of the title rather than being silently discarded: `Celeste bananas` does not return Celeste. Known full titles are recognized before tag and ranking words; use quotes for ambiguous titles, such as `"First"` or `"100% Fun"`. Percent signs and underscores in titles are literal characters.

The latest submitted search or manual filter change wins. A slower response from an earlier search cannot replace newer results, filters, selection, or errors. When a result list is empty, the previous game's detail and insight panels are cleared.

## Interface Layout

Opening the application without a workspace hash shows a bilingual homepage with **Enter as player** and **Enter as developer** links. Player discovery emphasizes game fit, price, and saved favorites; developer research emphasizes review counts, estimated ownership/revenue, research sorting, and opportunity insights. Estimates are labelled and the demo uses sample values. Both experiences retain natural-language search and the existing insight providers.

Player entry begins with **Recommended games**, a featured banner, and up to six illustrated cards selected by catalog rating, then review count, with stable title/ID ties. This is a transparent catalog selection, not a claim of personalized or live-trending recommendations. No search is submitted on entry. **Search games** opens an empty input and examples; only submitting a query or changing filters enters search results. **Back to recommendations** clears the query and filters and ignores pending search responses. Recommendation cards reveal the selected game's detail banner, retain its insight/source and save actions, and bring the banner into view when clicked.

Developer entry begins with **Research overview**: whole-catalog game/developer counts, average price (including free games), average rating, and the six most frequent tags. A game counts once for each of its tags, so tag counts are not exclusive market shares. Empty-catalog averages display a dash. Up to six research references are ordered by review count, then rating and stable title/ID. These describe the loaded catalog, not the wider market. No game is selected or analyzed on entry. Clicking a reference loads its existing detail and insight; clicking a tag filters the full catalog. **Search catalog** opens empty input, while **Back to overview** clears search/filter/selection state and rejects late search updates. Demo provenance and ownership/revenue estimate labels remain visible.

The homepage does not load the catalog, account collections, or game insights. Native `#player`, `#player/library`, `#player/profile`, `#developer`, and `#home` links support refresh and browser Back. The **Home** link is the way to choose another perspective; there is no inline role toggle. The three player pages share the current workspace's account and catalog. The search contract's `mode` remains an interpreted query hint and cannot change the chosen page. Returning home ends the current search/form session; saved records, collections, and language preference remain stored. The selected perspective never assigns or changes the authenticated account's permissions.

Search, current results, game price/rating, and save controls are the discovery flow. A dark interface with lime action colors frames a game-specific artwork banner and result thumbnails. Mode selection belongs in the URL/environment, with no setup controls in the customer header. Save-location limitations are stated at relevant save controls. Account and collection controls sit below game insights beside the discovery results on desktop and follow the results on narrow screens.

**My games** has cover shelves for All / Want to play / Playing / Played / Liked, a title/type search, and collection filtering. A native dialog edits status, affinity, and a 500-character note, or saves the game to a collection. Removing a play record preserves its collection membership. Existing collections remain visible, and the owner can classify their purpose as personal or research.

**My taste** separates distinct games of interest from actual Playing/Played records. Expand a type to see its game evidence. Personal collections and explicit likes provide interest evidence; research/unclassified collections do not. Multiple saves of one game count once; explicit dislikes and avoided tags take priority. Preferred tags are editable choices, labelled separately from evidence. These are game counts, not playtime. New accounts start with empty guidance. Homepage recommendations do not yet use the profile.

Advanced filters, extra examples, and **How this search works** are collapsed initially. Applied conditions stay visible as a short summary. Game insights keep a source label and explain their catalog-metadata basis; additional signals and nonempty collection insights expand on demand. Empty collections do not show zero-value analytics. Errors and retry actions remain visible.

Artwork for the 80 sample games is bundled locally, matched by normalized exact title rather than database ID. Unknown titles and failed image loads use a neutral gamepad placeholder. Result images load lazily. Store artwork is separate from the sample prices and ratings; see [artwork sources and rights](../docs/verification/game-artwork-sources.md) and [the expansion record](../docs/verification/catalog-expansion-2026-09-16.md).

## English and Chinese

The header's **中文 / EN** controls switch the interface without reloading or changing discovery/account state. The preference is stored separately in `game-discovery-lens.ui.language`; otherwise the browser's language selects Chinese (`zh-*`) or English. If browser storage is blocked, the switch still works for the current session. Document language and title follow the selection.

Search, account/collection controls, error recovery, tag labels, sample game summaries, and recognized demo/backend-rule insights have Chinese translations. Game/developer names and user-created collection names remain unchanged. Filters, stored collection names, and API payloads retain canonical values. Prices remain USD; the Chinese interface uses `US$` to avoid implying currency conversion.

Preset queries switch language with the interface; custom input remains untouched. Both parsers support the Chinese presets, including dollar budgets with decimals, rating/review conditions, and developer analysis. Unknown residual query terms still act as literal title conditions.

External AI text and changed or unrecognized catalog content remain verbatim, with an original-content note in the Chinese interface. Language switching does not request or fabricate AI translations. The optional DeepSeek integration and its rules fallback are retained.

## Module Layout

`App.tsx` composes the interface. `useDiscovery` owns catalog/search/filter selection; `useGameDetails` owns selected-game details and AI insight loading. Account and collection persistence stay in `useAccount` and `useCollections`. Their panels own local form/menu drafts, with collection drafts reset for a new account and save-menu drafts additionally reset for a new game.

`services/catalog.ts` retains the shared asynchronous caller interface and selects `catalog/api.ts` or `catalog/demo.ts` once at page load. The API adapter uses the existing HTTP/token helpers; the demo adapter contains browser storage and sample search/insight logic. Failures never switch adapters. See the [architecture guide](../docs/architecture.md) for responsibilities and the retained AI interfaces.

`usePlayerLibrary` owns play-record/preference loading and confirmed writes. Its separate `services/playerLibrary.ts` adapter shares the same data-mode and authenticated HTTP helpers; demo keys do not replace old collection keys. `lib/playerProfile.ts` derives evidence without network or AI calls. Old-account responses are ignored, private drafts reset on account changes, and uncertain writes require reload before retrying. An unreadable local record is not silently overwritten.

## Verify

```powershell
npm test
npm run build
```

Tests exercise data-mode separation, API error handling, account/collection state behavior, and search response ordering. Parser tests consume the same [search contract fixtures](../tests/fixtures/search-contract.json) as the backend, checking both intents and result IDs. The production build checks TypeScript and bundles the application. GitHub Actions runs both commands.
