import { afterEach, describe, expect, it } from 'vitest';
import { defaultIntent, readDiscoveryLocation, writeDiscoveryLocation } from '../src/lib/discoveryLocation';

afterEach(() => window.history.replaceState(null, '', '/'));
describe('public search links', () => {
  it('round trips applied conditions and selection without changing mode or route', () => {
    window.history.replaceState(null, '', '/?mode=api#player');
    const state = { query: '剧情但不要恐怖', intent: { ...defaultIntent('player'), tags: ['Story Rich'], excludedTags: ['Horror'], maxPrice: 30 }, selectedId: 2, edited: true };
    writeDiscoveryLocation('player', state);
    expect(readDiscoveryLocation('player')).toEqual(state);
    expect(readDiscoveryLocation('developer')).toBeNull();
    expect(window.location.hash).toBe('#player');
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('api');
    writeDiscoveryLocation('player', null);
    expect(window.location.search).toBe('?mode=api');
  });
  it('ignores malformed or unbounded links instead of trusting arbitrary JSON', () => {
    const state = { v: 1, view: 'player', query: 'Celeste', intent: defaultIntent('player'), selectedId: 2, edited: false };
    for (const bad of ['not json', JSON.stringify({ ...state, intent: { ...state.intent, tags: 'FPS' } }), JSON.stringify({ ...state, selectedId: -1 }), JSON.stringify({ ...state, intent: { ...state.intent, offset: -10 } }), JSON.stringify({ ...state, query: 'x'.repeat(501) })]) {
      window.history.replaceState(null, '', '/?search=' + encodeURIComponent(bad));
      expect(readDiscoveryLocation('player')).toBeNull();
    }
  });
});
