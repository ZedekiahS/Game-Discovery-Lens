# Profile-driven player recommendations

Date: 2026-10-15. Follows the [personal library and profile](player-library-2026-10-08.md).

## Product behavior

The player discovery page now uses the user's confirmed game records, explicit preferences, and personal collections. Cards and the featured game give concrete English/Chinese reasons: a wishlist entry, a preferred type, or a shared type with a named game from personal interests or play history. Players can open their profile from the page and see confirmed changes on returning. Search remains independent and can intentionally find a game excluded from recommendations.

New accounts keep the previous stable catalog recommendations. While private records load, the page waits before showing a personalized list. A load failure shows general picks with a retry action and no personalized claim. An account change clears the old feed's reasons; a delayed response cannot restore them.

No new endpoint, table, library dependency, model prompt, or paid model call was introduced. The existing DeepSeek search and game-insight interfaces remain available. The exact API source identifiers remain unchanged; game-insight presentation uses customer-facing labels instead of showing implementation mode names.

## Ranking policy

The pure `recommendForPlayer` function returns both games and structured reasons. It reuses `buildPlayerProfile` for deduplicated interest/history evidence and does not persist a second inferred profile.

1. Exclude games with an avoided tag, explicit dislike, or Playing/Played status. A wishlist does not override these exclusions.
2. Other known likes and personal collection saves stay in the library unless explicitly marked Want to play. Research/unclassified saves neither boost nor exclude games.
3. Rank tiers: wishlist, explicit preferred types, related interest/history evidence, then broader exploration. Explicit preferences outrank popularity and inferred taste.
4. Within a tier, each preferred tag contributes 6 points. Interest evidence contributes twice the weight of play-history evidence. A tag's evidence weight is `min(distinct supporting games, 3) / sqrt(catalog games with that tag)`. This limits broad/common tags and large collections. The candidate cannot be its own evidence, and disliked history is never positive evidence.
5. Select up to six, subtracting 0.35 per previously selected occurrence of a candidate's tags within its tier to encourage variety. Rating, review count, title, and ID provide deterministic tie-breaks. The function does not relax exclusions to fill empty slots.

Reasons explain factual matching signals, not a probability or AI confidence. The rules and weights are product choices, not a learned or user-validated recommender. Catalog metrics remain sample data. No measured playtime or behavior telemetry is inferred.

## Validation

- The frontend now has 185 tests across 21 files. The complete run passed 184 and exposed one selection regression; after the fix, all 18 affected recommendation/account UI tests passed in a focused rerun. An earlier outdated bilingual title expectation was also updated to the new personalized behavior.
- TypeScript and Vite production build passed after the final selection fix.
- Unit checks cover cold start, research exclusion, preference priority, hard exclusions, insufficient candidates, wishlist behavior, deduplication, evidence source identity, distinct play-history reasons, variety, determinism, and input immutability.
- UI checks cover editing preferences then returning to discovery, reload persistence, Chinese/English reasons, independent search, newly played games leaving the cards and featured pick, intentional saved-game inspection, logout/login as another account, failed-load recovery, and a late response after logout.
- The selection regression occurred because an unrelated save recreated the feed object and reset the chosen game. Selection now also checks eligibility and account/revision scope: an eligible selected game survives, an excluded one moves to the new first pick, and another account never inherits the choice.
- Real-browser checks used a fresh isolated headless Edge context at `127.0.0.1:4189`, separate from the user's existing browser storage. Ready or Not was marked Not for me, Celeste was marked Played/Like, Outer Wilds was marked Want to play, Puzzle/Cozy were preferred, and FPS was avoided. The resulting feed started with Outer Wilds, PICO PARK, Tiny Glade, TUNIC, Sticky Business, and Human Fall Flat. Reload preserved this order. These were synthetic records entered through the UI for validation only.
- Viewports of 1440 × 1000, 375 × 812, and 812 × 375 were checked. Mobile and landscape document width matched viewport width; the preference action was 44 px tall. No page errors were captured.

The authenticated UI paths use controlled service responses in this phase; this is not a new real-database end-to-end run. Backend persistence code is unchanged from the previous phase, whose 92-test database run is recorded separately. Its uploaded commit `f7b7a16` also passed [GitHub Actions](https://github.com/ZedekiahS/Game-Discovery-Lens/actions/runs/38757433414).

Commands from `frontend/`:

```powershell
npm test -- --reporter=dot
npx vitest run tests/recommendation-ui.test.tsx tests/personalized-recommendation-ui.test.tsx tests/panels-ui.test.tsx --reporter=dot
npm run build
```

## Screenshots

- [Chinese recommendations](../screenshots/personalized-recommendations-zh.png)
- [English recommendations](../screenshots/personalized-recommendations-en.png)
- [Mobile recommendations](../screenshots/personalized-recommendations-mobile.png)

The screenshots use synthetic validation preferences; the application does not seed these into a new account. Ranking quality still needs independent scenarios or user feedback. These checks establish consistent, explainable behavior and privacy boundaries, not measured relevance, click-through, or retention.
