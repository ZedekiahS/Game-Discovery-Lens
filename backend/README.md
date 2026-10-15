# Game Discovery Lens Backend

FastAPI backend for the modern Game Discovery Lens web app.

## Run Locally

### Docker

From the repository root:

```powershell
docker compose up -d postgres backend
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed
```

Open:

```text
http://localhost:8000/docs
```

## API Preview

List the 80 seeded demo games:

```text
GET /api/games
GET /api/games/{id}
GET /api/games/{id}/insights
POST /api/search
GET /api/users               # admin bearer token required
GET /api/users/{userId}      # same user or admin bearer token required
POST /api/auth/login
POST /api/auth/register
GET /api/auth/me
GET /api/collections
POST /api/collections
PATCH /api/collections/{collectionId}
DELETE /api/collections/{collectionId}
GET /api/saved-games
GET /api/saved-games/insights
POST /api/saved-games
DELETE /api/saved-games
DELETE /api/saved-games/{gameId}
GET /api/me/games
PUT /api/me/games/{gameId}
DELETE /api/me/games/{gameId}
GET /api/me/preferences
PUT /api/me/preferences
```

All collection and saved-game endpoints, including `/api/saved-games/insights`, require an active account's bearer token. Missing, invalid, expired, or inactive-account tokens return `401`. Ownership always comes from that token. Requests targeting another account's collection return `404`.

Saved-game endpoints accept an optional `collectionId` query/body field. When omitted, the API uses the authenticated user's `Default Shortlist` collection. Saving the same game to the same collection again returns the existing saved item.

Collection create/update and saved-game request bodies no longer accept `userId` (or other extra fields); these return `422`. Legacy `userId` query parameters are ignored and cannot change ownership. Example bodies:

```json
{"name": "Wishlist", "description": "Games to compare"}
```

```json
{"gameId": 2, "collectionId": 4}
```

The anonymous `POST /api/users/session` endpoint has been removed. Use `/api/auth/register` or `/api/auth/login` for API-backed saves. The frontend's fixed-data demo stores collections in the browser without creating server guest users. Existing guest records are retained; this change does not migrate or delete their data.

### Personal Game Records

Run `alembic upgrade head` before using the player library. Migration `0005_player_library` adds `player_games`, `player_preferences`, and `collections.purpose`; existing collections keep their data and receive `unspecified`. Rerun the seed script to apply the corrected shared catalog descriptions and tags; this does not import user play history.

The `/api/me/*` endpoints require an active bearer token and derive the owner from it. They reject extra owner fields and cannot be redirected with a `userId` query. A record is independent of collections and unique per user/game. `PUT` replaces the record; repeated writes use an atomic PostgreSQL upsert. `DELETE` is idempotent and leaves collection saves intact.

```json
{"status": "playing", "affinity": "like", "notes": "Try the next chapter"}
```

Status can be `null`, `want_to_play`, `playing`, or `played`; affinity can be `neutral`, `like`, or `dislike`. Notes are trimmed and limited to 500 characters. Preference lists contain up to 12 canonical catalog tags each, are deduplicated, and cannot overlap:

```json
{"preferredTags": ["Puzzle"], "avoidedTags": ["Survival Horror"]}
```

Empty lists clear preferences. Collection create/update accepts optional `purpose`: `player`, `research`, or `unspecified`. The default collection's purpose can change while its name remains unchanged. These fields support evidence-based frontend profiles and deterministic personalized recommendations. They do not represent measured playtime; no separate recommendation endpoint or additional migration is needed.

The seed script also creates a local admin placeholder account. Configure these values through local environment variables only:

```env
GDL_ADMIN_USER_ID=local-admin
GDL_ADMIN_EMAIL=admin@game-discovery-lens.local
GDL_ADMIN_DISPLAY_NAME=Local Admin
GDL_ADMIN_PASSWORD=change-this-local-admin-password
GDL_AUTH_SECRET=local-only-change-this-auth-secret
GDL_AUTH_TOKEN_TTL_SECONDS=43200
```

The password is hashed before storage. `/api/auth/login` returns a bearer token for the signed-in account; use deployment secrets for real environments. Choosing a player or developer page does not change the account's permissions.

Run the AI-ready search flow:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8000/api/search" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"query":"Show highly rated story rich games under 25 dollars"}'
```

The search endpoint defaults to the local rules-based intent parser. The optional DeepSeek provider and configured rules fallback are retained and use the same normalized intent and search response contract as the frontend demo parser.

### Search Contract

`titleQuery` is nullable and matches game names case-insensitively as literal text. `maxPrice: null` means there is no price limit; a supplied decimal budget is retained. Title, tags, budget, rating, and review filters combine with AND before sorting and limiting results. For example, `Celeste Story Rich under $20.99` applies all three constraints. Blank queries leave the catalog unfiltered, and unknown titles return an empty `games` array.

Recognized conditions outside a known or quoted title follow these product conventions:

| Condition | Contract |
| --- | --- |
| `free`, `free-to-play`, `free to play`, `免费` | `maxPrice: 0`, including when an explicit budget is also present. |
| `cheap`, `deal`, `便宜` | Default `maxPrice: 35` and price-ascending order; an explicit budget replaces 35 without removing that ordering. |
| `highly rated`, `top rated`, `高评分` | `minRating: 4.4`, `hasReviews: true`, and rating-descending order. |
| Review conditions such as `good reviews`, `most reviews`, `有评价` | A positive review count is required; the phrase alone does not imply a minimum rating. |

Price ceilings are inclusive. Cheapest/most-expensive ranking does not imply a budget. The provider prompt includes these conventions and catalog titles. After provider normalization, code applies recognized price/rating/review constraints to the query with known/quoted titles removed, then preserves the rules title guard. Thus the final `deepseek` intent includes application enforcement rather than being a raw model output.

Known full titles are protected before parsing tag or ranking words. Quote ambiguous titles, such as `"First"` or `"100% Fun"`; `%` and `_` are literal title characters rather than SQL wildcards. Unrecognized residual words remain part of the title, so `Celeste bananas` cannot silently become a Celeste-only search. The frontend accepts results only from the latest submitted search or manual filter change, preventing late responses from restoring old results or selection.

Both parsers and the PostgreSQL HTTP tests consume [the shared search contract fixtures](../tests/fixtures/search-contract.json). The response's `source` continues to identify `rules` or `deepseek`; the title-search change does not remove the provider or the game/collection insight features.

### Optional AI Provider

Game Discovery Lens defaults to the free local rules parser. To enable the existing DeepSeek-backed parser, configure these values in your local `.env` or deployment secrets:

```env
GDL_AI_ENABLED=true
GDL_AI_PROVIDER=deepseek
GDL_AI_FALLBACK_TO_RULES=true
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_API_KEY=your-local-key
```

If the provider is disabled, missing a key, or returns an invalid payload, `/api/search` falls back to the local rules parser when `GDL_AI_FALLBACK_TO_RULES=true`.

### Search Provider Evaluation

The [original live evaluation](../docs/verification/ai-evaluation-2026-09-15.md) preserves the pre-fix comparison and observed gaps. The [contract-fix record](../docs/verification/search-fixes-2026-09-16.md) documents the subsequent 31/31 live integration pass on the same queries, the eight-query independent follow-up, and its separately preserved expectation correction/offline rescore. These are selected application-contract checks, not raw model accuracy. The CLI defaults to rules only and requires an explicit local `GDL_TEST_DATABASE_URL`; it creates and removes its own PostgreSQL schema.

```powershell
# From backend; no AI request unless --live is provided.
python -m app.scripts.evaluate_search --output ../docs/evaluations/rules-new.json
python -m app.scripts.evaluate_search --live --model deepseek-flash --max-calls 21 --output ../docs/evaluations/live-new.json
```

`--fixture ../tests/fixtures/search-evaluation-boundaries.json` selects the independent 16-game/10-query boundary set. Live runs are opt-in and are not part of CI. Requests have a 1,024-token output cap, thinking disabled, the configured timeout, and no evaluator retries. Existing local `.env` model overrides remain effective; `--model` changes only the evaluation run. The report records requested model and observed latency, not billing or general model accuracy.

### Local PostgreSQL + Python virtual environment

The backend reads environment variables from the repository root `.env` file when it exists. The default local URL is:

```powershell
$env:GDL_DATABASE_URL="postgresql+psycopg://gdl:gdl_dev_password@localhost:5432/gdl"
```

Create a virtual environment and install dependencies:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If Python 3.12 is unavailable, use Python 3.10 or newer.

Create the local database once in PostgreSQL:

```powershell
psql -U postgres -d postgres -c "CREATE ROLE gdl LOGIN PASSWORD 'gdl_dev_password';"
createdb -U postgres --owner gdl gdl
```

Run migrations and seed demo data:

```powershell
alembic upgrade head
python -m app.scripts.seed
```

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000/docs
```

## Test

Install the development dependencies and run backend tests from the repository root:

```powershell
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -t backend
```

This runs the unit and HTTP route tests without connecting to a database or calling an AI provider. PostgreSQL integration tests are skipped unless explicitly enabled:

```powershell
$env:GDL_TEST_DATABASE_URL="postgresql+psycopg://gdl:gdl_dev_password@localhost:5432/gdl"
python -m unittest discover -s backend/tests -t backend
```

The integration suite accepts only a local PostgreSQL URL without query parameters. Collection tests create unique `gdl_test_<uuid>` schemas; the search suite creates an `gdl_search_test_<uuid>` schema. Tests use the real PostgreSQL models (including array fields), open a fresh database session per request, and drop only their own schemas during cleanup. The database user needs permission to create schemas. Existing application tables and data are not used.

Coverage includes login/save/reload, repeated-save idempotence, account isolation across read/write/delete/insights routes, forged owner inputs, and rejection of missing/expired/inactive sessions without data changes. Search coverage checks the shared title/filter examples and literal wildcard characters through HTTP against PostgreSQL. AI search fallback, intent parsing, and game/collection insight tests remain part of the same suite; these tests do not require a provider key.
