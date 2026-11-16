# Game Discovery Lens: Migration Status and Portfolio Scope

Updated 2026-11-16. **Feature development is frozen for portfolio use. / 本版本冻结功能开发，仅作简历与作品集展示。** The SQL Server-first plan in the original version of this document has been superseded. The current application is React/TypeScript + FastAPI + PostgreSQL; it runs independently of the original school database. This document records completed migration and accepted limits, not a public commercial launch plan. The [bilingual README](../README.md) explains the before/after implementation and authorship boundaries on one page.

## Completed migration

| Area | Current implementation and evidence |
| --- | --- |
| Runtime | React/Vite frontend, FastAPI backend, PostgreSQL and Alembic. [Local setup](local-postgres-setup.md), [architecture](architecture.md). Node 24 is pinned for the frontend and CI. |
| Identity and private data | Email/password registration, signed bearer authentication, server-owned collections, game records and preferences. Cross-tab account changes, stale responses and owner-scoped unsaved drafts have regression coverage. |
| Player experience | English/Chinese discovery, editable search conditions, private library sorting and return state, quick preferences, notes, personal collections and evidence-based recommendations. |
| Search and AI boundary | Bounded bilingual rules search; optional DeepSeek interpretation with normalized fields and configured fallback. Database queries remain deterministic. No paid provider is needed for local tests. |
| Data credibility | 80 catalog entries with source-linked gameplay summaries and editorial tags. Prices, ratings, counts, ownership and revenue are synthetic demo values. No source review corpus is connected. |
| Quality gates | Frontend unit/UI tests and production build, backend tests with isolated PostgreSQL schemas, dependency audit, desktop/mobile real-API browser journeys, actual Docker/built-frontend delivery smoke, and documented Computer Use checks. |

## Completed semantic consistency and recommendation evidence

The [2026-10-29 verification record](verification/tag-semantics-recommendations-2026-10-29.md) covers three bounded changes:

1. A shared, directional tag contract: Multiplayer includes Co-op; Horror includes Survival Horror. Search and preference exclusions apply the same scope without rewriting raw catalog tags.
2. Concrete gameplay evidence outranks broad themes and player-count coincidence. Diversity only breaks equal relevance scores. Original and additional frozen editorial scenarios retain their labels and report both improvements and regressions.
3. Documentation now describes the implemented application instead of scheduling already completed architecture work.

## Legacy scope

`UI/`, root `migrations/`, `Views/` and the original data import code preserve the Java Swing/SQL Server coursework. Group authorship remains distinct from the modern refactor. [SQL Server setup](local-sqlserver-setup.md) is optional historical reproduction, not a prerequisite or the next deployment stage. Legacy `ArcadeIQ` database/principal identifiers are compatibility details.

Purchases, vouchers, bundles and reviews in the legacy system are not current web features. The modern app does not fetch public reviews or summarize review originals. Developer views use catalog metadata and explicitly identified synthetic aggregates; they do not establish real market demand.

## Final reliability and documentation closure

The [November 15 checks](verification/delivery-preferences-search-2026-11-15.md) cover actual packaged delivery, atomic preference versions, complete search phrases and SQL/browser/URL ordering. The [November 16 closure](verification/portfolio-freeze-2026-11-16.md) fixes the registration first-click interaction and records the final documentation/verification. Modern Alembic migrations preserve existing data; the sample catalog seed is separate from schema upgrades.

## Accepted limits; no active roadmap

The fixed editorial recommendation fixtures support diagnosis, not independent proof of user satisfaction. A complete mode taxonomy, additional live provider evaluation, real market/review ingestion, public comments and production account operations are outside the frozen version. There is no planned next feature phase, database replacement or public commercial launch. Historical future-work notes are not current commitments. The maintainer may separately authorize a necessary defect/documentation correction; this document does not automatically open new work.
