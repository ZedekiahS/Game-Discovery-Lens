# Game Discovery Lens

**Discover your next game. Research the games behind your next idea.**

Game Discovery Lens is a bilingual game-discovery portfolio application built with React, TypeScript, FastAPI, and PostgreSQL. Its 80-game sample catalog demonstrates reliable software behavior through account-owned collections, a personal game library, an evidence-based taste profile, recoverable failures, and an optional AI search provider.

The project began as group coursework using Java Swing and SQL Server. The modern web application is a subsequent refactor; the original implementation remains in the repository as project history. The modern app runs independently of the original school database.

The portfolio was renamed from ArcadeIQ to Game Discovery Lens. Historical verification records retain the names and configuration identifiers used when those checks were captured.

Read the [engineering case study](docs/case-study.md) for the problems, decisions, verification evidence, and remaining limits behind the refactor.

## Two Ways to Explore

The homepage offers player and developer entry points. Each opens a distinct browsing experience before the user starts a search.

| Player discovery | Developer research |
| --- | --- |
| Illustrated discovery, personal game shelves, play records, and an editable taste profile. | A catalog overview, frequent tags, research references, and selected-game opportunity insights. |
| Recommendations use explicit preferences and game-library evidence; new players start with stable catalog picks. | Overview statistics describe the loaded catalog; ownership and revenue estimates are labelled. |
| Search by title, genre, budget, or natural-language conditions. | Drill into a tag or search and sort games for comparison. |

These are viewing perspectives, independent of account permissions. Both support collections and return to the homepage to choose another perspective.

### Player / 玩家

| 中文 | English |
| --- | --- |
| ![Chinese personalized player discovery](docs/screenshots/personalized-recommendations-zh.png) | ![English personalized player discovery](docs/screenshots/personalized-recommendations-en.png) |

### Developer / 开发者

| 中文 | English |
| --- | --- |
| ![Chinese developer research overview](docs/screenshots/developer-zh.png) | ![English developer research overview](docs/screenshots/developer-en.png) |

Screenshots show the fixed-data demo. The dark gaming interface includes locally bundled game artwork, responsive layouts, and an English/Chinese switch that preserves the current page state. Game names, user-created collection names, and external provider text remain unchanged. See [artwork sources](docs/verification/game-artwork-sources.md) and the [bilingual behavior](frontend/README.md#english-and-chinese).

### Personal library and gaming taste / 游戏库与玩家画像

Players can record **Want to play / Playing / Played**, mark **Like / Not for me**, and keep a short personal note. Collection membership remains independent of those records. New accounts and fresh browser profiles receive a personal default collection, so their first save can inform recommendations. Existing collections retain their recorded purpose, including unspecified; players can classify them as personal interests or research references.

The taste profile separates games of interest from games marked Playing or Played. Each type expands to show the games behind its count. A game saved to multiple personal collections counts once, research collections are excluded, and an explicit dislike overrides collection-based interest. Players can edit preferred and avoided types. These are manually recorded preferences and game counts, not imported Steam playtime or AI-inferred personality scores.

The player homepage now uses that profile. Want-to-play games and explicit preferred types take precedence, followed by related personal interests and play history. Recommendations exclude avoided types, disliked games, and Playing/Played records; other known favorites stay in the library unless marked Want to play. Each recommendation gives a concrete reason in either language. Changes apply when returning from the library/profile, and explicit search still covers the full catalog. A new account receives general picks. Preference-loading failures show general picks with a retry action instead of claiming personalization. See [the ranking rules and verification](docs/verification/personalized-recommendations-2026-10-15.md).

| 游戏库 | 玩家画像 / Gaming taste |
| --- | --- |
| ![Personal library in Chinese](docs/screenshots/player-library-zh.png) | ![Personal gaming taste in Chinese](docs/screenshots/player-profile-zh.png) |
| ![Personal library in English](docs/screenshots/player-library-en.png) | ![Personal gaming taste in English](docs/screenshots/player-profile-en.png) |

These screenshots use six manually entered validation records, not a real player's activity. Fresh accounts start empty. The 80 catalog entries have bilingual gameplay summaries and curated tags linked to official store descriptions in each entry's `contentSource`. Prices, ratings, review counts, ownership, and revenue in the bundled catalog remain synthetic sample values; the source check does not validate those metrics. See [the implementation and verification record](docs/verification/player-library-2026-10-08.md).

## Run the Demo

Use Node.js 24 LTS, matching `.nvmrc` and CI. From the repository root:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [Game Discovery Lens demo](http://127.0.0.1:5173/?mode=demo). No database or AI key is required.

| Mode | Catalog and search | Collections, play records, and preferences |
| --- | --- | --- |
| `?mode=demo` | Bundled 80-game sample catalog and local rules; no backend requests. | Saved in this browser only. |
| `?mode=api` | FastAPI/PostgreSQL and the configured search provider. | Saved to the signed-in account. |

The URL or environment selects the data mode; setup controls are kept out of the customer header. The browser-only persistence limitation is stated beside the relevant save controls. An API failure remains visible with recovery controls; it never becomes a sample result or a browser-only save. Demo and account data are separate.

## Run with the API

Start PostgreSQL and the backend with Docker, then migrate and seed the local database. Run these commands from the repository root while the frontend remains open in another terminal:

```powershell
docker compose up -d postgres backend
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed
```

Open [API mode](http://127.0.0.1:5173/?mode=api), choose a perspective, and register or sign in to save games. API documentation is available at [localhost:8000/docs](http://localhost:8000/docs). For an existing local PostgreSQL installation, use the [native Python setup](backend/README.md#local-postgresql--python-virtual-environment).

The frontend defaults to `http://localhost:8000/api`. To change it, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`; restart Vite afterward. The URL's `mode` overrides `VITE_DATA_MODE`. Backend settings belong in the repository root `.env`; for a different frontend host or port, include its exact origin in `GDL_CORS_ORIGINS`. See the [frontend](frontend/README.md) and [backend](backend/README.md) configuration guides.

## Engineering Focus

- **Account ownership:** collection, saved-game, play-record, and preference routes derive the owner from a signed bearer token. Missing or expired sessions are rejected, and another account's data is hidden.
- **Explainable personal data:** the profile uses distinct games and explicit preferences, with inspectable evidence and separate interest/play-history counts. Migration `0005_player_library` adds storage without reclassifying or deleting old collections.
- **Persistence and recovery:** API requests have a 30-second deadline and never automatically retry writes. An uncertain save locks further writes until a successful reload. Collection clear/delete actions require confirmation; unsaved game notes and preference edits are protected when closing or navigating away. Reloading a failed save preserves its draft.
- **Concurrent requests:** an older search, game insight, or account response cannot replace a newer selection or session.
- **Search consistency:** literal title search combines with price, tag, and review filters. Frontend rules and PostgreSQL search tests share `tests/fixtures/search-contract.json`.
- **Clear module boundaries:** page composition, discovery, selected-game details, account/collection state, and API/demo adapters have separate responsibilities.
- **Reproducible verification:** unit and UI tests, isolated PostgreSQL integration tests, TypeScript/build checks, and desktop/mobile browser journeys run in GitHub Actions. The browser suite registers accounts through the UI and exercises the real API, including recovery after a committed save loses its response. See [browser test setup](frontend/README.md#browser-tests-with-the-real-api).

## AI Behavior and Boundaries

Natural-language search supports a local rules parser and an optional DeepSeek provider. Provider output is normalized into the same search contract, with recognized product price/rating/review conditions enforced in code; PostgreSQL executes the resulting filters and ranking. Free games have a zero-price ceiling, `cheap` defaults to US$35 unless a budget is specified, and `highly rated` requires a rating of at least 4.4 and a positive review count. Known and quoted titles are separated from those conditions. Search responses identify their source as `rules` or `deepseek`. Configured fallback returns rules results when the provider fails; disabling fallback exposes the provider error.

Game and collection insight text currently uses catalog metadata and aggregate statistics; it is not a summary of review source text. Personal recommendations use deterministic rules over the player's records and preferences, with no additional model call or live-trending claim. Game insight labels distinguish game details from DeepSeek output; API responses retain the precise source identifiers. The Chinese interface translates recognized sample/rule content and preserves unrecognized provider text with an original-content note.

See the [optional provider configuration](backend/README.md#optional-ai-provider). Provider keys stay in backend environment variables, never in `VITE_*` variables or Git. The preserved [first live evaluation](docs/verification/ai-evaluation-2026-09-15.md) found 24/31 DeepSeek integration cases meeting both intent and ordered-result expectations. After the contract fixes, a [new live pass](docs/verification/search-fixes-2026-09-16.md) met both in 31/31 on the same queries, with no observed fallbacks. These are application-integration results, including deterministic constraints, not raw model accuracy. Eight independently formulated follow-up queries have a separately documented fixture correction and offline rescore; broader held-out evaluation and traceable review evidence remain future work.

## Verification

Frontend tests and production build, from `frontend/`:

```powershell
npm test
npm run build
```

Backend tests, from the repository root using Python 3.10 or newer:

```powershell
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -t backend
```

To include PostgreSQL persistence, ownership, and search checks, set a local test database URL before running the same backend command:

```powershell
$env:GDL_TEST_DATABASE_URL="postgresql+psycopg://gdl:gdl_dev_password@localhost:5432/gdl"
python -m unittest discover -s backend/tests -t backend
```

Each database suite creates and removes only its own UUID-named schema. Existing application tables are not used. Without the explicit URL, database tests are skipped. Provider responses are controlled in automated AI tests; the suite does not call a paid provider. [GitHub Actions](.github/workflows/ci.yml) configures PostgreSQL for the backend tests and runs the frontend tests and build.

Verification records separate the executed checks from their limitations:

- [Personalized recommendations, account transitions, and bilingual evidence](docs/verification/personalized-recommendations-2026-10-15.md)
- [Personal library, evidence-based profile, catalog corrections, and migration](docs/verification/player-library-2026-10-08.md)
- [80-game catalog expansion and artwork provenance](docs/verification/catalog-expansion-2026-09-16.md)
- [API workflow and delivery](docs/verification/api-delivery-2026-09-15.md)
- [Search contract fixes, live rerun, and independent follow-up](docs/verification/search-fixes-2026-09-16.md)
- [Original live AI baseline and expanded test catalog](docs/verification/ai-evaluation-2026-09-15.md)
- [Collection persistence and isolation](docs/verification/collections-2026-09-14.md)
- [Search contract and response ordering](docs/verification/search-2026-09-14.md)
- [Module refactor](docs/verification/modules-2026-09-15.md)
- [Bilingual interface](docs/verification/bilingual-2026-09-15.md), [entry flow](docs/verification/entry-2026-09-15.md), [player recommendations](docs/verification/recommendations-2026-09-15.md), and [research overview](docs/verification/research-overview-2026-09-15.md)

## Repository Guide

| Path | Purpose |
| --- | --- |
| `catalog/` | Shared 80-game demo catalog used by the frontend and backend seed. |
| `frontend/` | Current React/TypeScript application, API/demo adapters, and UI tests. |
| `backend/` | FastAPI routes, SQLAlchemy models, Alembic migrations, and backend tests. |
| `tests/fixtures/` | Shared search contract and an independent synthetic boundary catalog for evaluation. |
| `docs/` | Architecture, setup guides, verification records, and screenshots. |
| `scripts/` | Local frontend, backend, and database setup helpers. |
| `UI/`, `migrations/`, `Views/` | Original Java Swing/SQL Server application and database logic. |
| `PopulationScripts/`, `WebScrape/`, `data/` | Legacy CSV ingestion, scraping utilities, and seed data. |
| `demo/` | Earlier static prototype retained for reference. |

Read the [architecture guide](docs/architecture.md) for the current module and data flow. The modern application uses PostgreSQL; SQL Server stored procedures, transactions, Java Swing, and bcrypt belong to the legacy implementation. The modern API uses PBKDF2 password hashing and signed bearer tokens.

The retained coursework includes marketplace workflows such as purchasing, reviews, bundles, vouchers, and folders. These are historical features, not claims about the current web interface. See the [SQL Server setup](docs/local-sqlserver-setup.md), [legacy migrations](migrations/README.md), and [migration plan](docs/migration-plan.md).

Game Discovery Lens is a portfolio application. Further work centers on evaluating recommendation quality with independent user scenarios, traceable AI evidence, and evaluated provider behavior; a public production deployment is outside the current demonstration scope.
