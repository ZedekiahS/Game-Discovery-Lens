import catalog from '../../catalog/demo-catalog.json';
import originalFixture from '../../tests/fixtures/recommendation-scenarios.json';
import { recommendForPlayer, recommendGames, type RecommendationContext } from '../src/lib/recommendations';
import type { PlayerGameRecord, GameCollection, SavedGame } from '../src/types';
import { matchesTag } from '../src/lib/tagSemantics';

// Relevance labels live in the fixture, not in the ranking implementation.
interface Scenario {
  id: string; brief: string; preferred: string[]; avoided: string[];
  records: { id: number; status?: string; affinity?: string }[];
  personal: number[][]; research: number[]; relevant?: number[];
  personalized?: boolean; topTwo?: number[]; minimumPrecision?: number; sameAs?: string;
  forbiddenIds?: number[];
}

export function evaluateRecommendations(fixture: { version: number; purpose: string; scenarios: Scenario[] } = originalFixture) {
  const rows = fixture.scenarios.map(scenario => {
    const records: PlayerGameRecord[] = scenario.records.map(row => ({ gameId: row.id, status: (row.status ?? null) as PlayerGameRecord['status'], affinity: (row.affinity ?? 'neutral') as PlayerGameRecord['affinity'], notes: '', updatedAt: '' }));
    const collections: GameCollection[] = [];
    const saved: Record<number, SavedGame[]> = {};
    for (const [index, ids] of [...scenario.personal, scenario.research].entries()) {
      const id = index + 1;
      collections.push({ id, userId: 'evaluation', name: `Folder ${id}`, description: '', createdAt: '', purpose: index < scenario.personal.length ? 'player' : 'research' });
      saved[id] = ids.map(gameId => ({ id: gameId, userId: 'evaluation', collectionId: id, gameId, createdAt: '', game: catalog.find(g => g.id === gameId)! }));
    }
    const context: RecommendationContext = { records, collections, saved, preferences: { preferredTags: scenario.preferred, avoidedTags: scenario.avoided } };
    const feed = recommendForPlayer(catalog, context);
    const ids = feed.items.map(item => item.game.id);
    const personal = new Set(scenario.personal.flat());
    const violations: string[] = [];
    for (const id of ids) if (scenario.forbiddenIds?.includes(id)) violations.push(`forbidden-by-scenario:${id}`);
    for (const item of feed.items) {
      const record = records.find(r => r.gameId === item.game.id);
      if (item.game.tags.some(tag => scenario.avoided.includes(tag)) || record?.affinity === 'dislike' || ['playing','played'].includes(record?.status ?? '')) violations.push(`ineligible:${item.game.id}`);
      if (record?.status !== 'want_to_play' && (personal.has(item.game.id) || record?.affinity === 'like')) violations.push(`known-favorite:${item.game.id}`);
      for (const reason of item.reasons) {
        if (reason.kind === 'preferred' && !reason.tags.every(tag => scenario.preferred.includes(tag) && matchesTag(item.game.tags, tag))) violations.push('unbacked-preference');
        if (reason.kind === 'wishlist' && record?.status !== 'want_to_play') violations.push('unbacked-wishlist');
        if (reason.kind === 'interest' || reason.kind === 'history') {
          const source = catalog.find(g => g.name === reason.gameName);
          const evidence = records.find(r => r.gameId === source?.id);
          if (!source || source.id === item.game.id || !source.tags.includes(reason.tag) || !item.game.tags.includes(reason.tag) || evidence?.affinity === 'dislike'
            || (reason.kind === 'interest' ? !(personal.has(source.id) || evidence?.affinity === 'like') : !['playing','played'].includes(evidence?.status ?? ''))) violations.push('unbacked-game-reason');
        }
      }
    }
    if (new Set(ids).size !== ids.length) violations.push('duplicate');
    if (JSON.stringify(feed) !== JSON.stringify(recommendForPlayer([...catalog].reverse(), context))) violations.push('unstable-order');
    if ('personalized' in scenario && feed.personalized !== scenario.personalized) violations.push('incorrect-personalization');
    if ('topTwo' in scenario && scenario.topTwo?.some(id => !ids.slice(0,2).includes(id))) violations.push('wishlist-not-first');
    const relevant = 'relevant' in scenario ? scenario.relevant : undefined;
    const precision = (ranking: number[]) => relevant ? ranking.filter(id => relevant.includes(id)).length / Math.max(1, ranking.length) : null;
    const dcg = (ranking: number[]) => ranking.reduce((sum,id,i) => sum + (relevant?.includes(id) ? 1 / Math.log2(i + 2) : 0), 0);
    const ideal = relevant ? relevant.slice(0,6).map((_,i) => 1 / Math.log2(i+2)).reduce((a,b) => a+b,0) : 0;
    const precisionAt6 = precision(ids);
    if ('minimumPrecision' in scenario && precisionAt6 !== null && precisionAt6 < (scenario.minimumPrecision ?? 0)) violations.push('explicit-preference-miss');
    return { id: scenario.id, brief: scenario.brief, ids, names: feed.items.map(item => item.game.name), personalized: feed.personalized, precisionAt6, ndcgAt6: ideal ? dcg(ids)/ideal : null,
      popularityPrecisionAt6: precision(recommendGames(catalog).map(g => g.id)), uniquePrimaryTypes: new Set(feed.items.map(i=>i.game.tags[0])).size, violations, reasons: feed.items.map(item => ({ id:item.game.id, reasons:item.reasons })) };
  });
  for (const scenario of fixture.scenarios) if ('sameAs' in scenario && scenario.sameAs) {
    const row = rows.find(row => row.id === scenario.id)!;
    if (JSON.stringify(row.ids) !== JSON.stringify(rows.find(row => row.id === scenario.sameAs)!.ids)) row.violations.push('collection-isolation');
  }
  const scored = rows.filter(row => row.precisionAt6 !== null);
  return { fixtureVersion: fixture.version, catalogSize: catalog.length, scope: fixture.purpose,
    summary: { scenarios: rows.length, scored: scored.length, violations: rows.reduce((n,r)=>n+r.violations.length,0), macroPrecisionAt6: scored.reduce((n,r)=>n+r.precisionAt6!,0)/scored.length, popularityMacroPrecisionAt6: scored.reduce((n,r)=>n+r.popularityPrecisionAt6!,0)/scored.length }, rows };
}
