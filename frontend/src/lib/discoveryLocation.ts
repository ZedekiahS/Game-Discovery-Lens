import type { SearchIntent } from '../types';

export const defaultIntent = (mode: SearchIntent['mode']): SearchIntent => ({
  titleQuery: null, maxPrice: null, minRating: 0, hasReviews: false, tags: [], excludedTags: [], mode,
  sortBy: null, sortDirection: 'asc', limit: null, offset: 0,
});
export interface DiscoveryLocation {
  query: string;
  intent: SearchIntent;
  selectedId: number | null;
  edited: boolean;
}

// Only public, applied discovery state belongs in a link. Never store account data or drafts here.
export function readDiscoveryLocation(view: SearchIntent['mode']): DiscoveryLocation | null {
  const raw = new URL(window.location.href).searchParams.get('search');
  if (!raw || raw.length > 8000) return null;
  try {
    const s = JSON.parse(raw), i = s?.intent;
    const bounded = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
    const tags = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(t => typeof t === 'string' && t.length <= 120);
    if (s.v !== 1 || s.view !== view || typeof s.query !== 'string' || s.query.length > 500 || typeof s.edited !== 'boolean'
      || !(s.selectedId === null || Number.isSafeInteger(s.selectedId) && s.selectedId > 0)
      || !i || !(i.titleQuery === null || typeof i.titleQuery === 'string' && i.titleQuery.length <= 500)
      || !(i.maxPrice === null || bounded(i.maxPrice, 1e9)) || !bounded(i.minRating, 5) || typeof i.hasReviews !== 'boolean'
      || !tags(i.tags) || !tags(i.excludedTags ?? []) || ![null, 'name', 'price', 'rating', 'review_count', 'release_year', 'revenue', 'ownership'].includes(i.sortBy)
      || !['asc', 'desc'].includes(i.sortDirection) || !(i.limit === null || Number.isInteger(i.limit) && i.limit > 0 && i.limit <= 1000000)
      || !Number.isInteger(i.offset) || !bounded(i.offset, 1000000)) return null;
    return { query: s.query, selectedId: s.selectedId, edited: s.edited,
      intent: { titleQuery: i.titleQuery, maxPrice: i.maxPrice, minRating: i.minRating, hasReviews: i.hasReviews,
        tags: i.tags, excludedTags: i.excludedTags ?? [], mode: view, sortBy: i.sortBy, sortDirection: i.sortDirection, limit: i.limit, offset: i.offset } };
  } catch { return null; }
}

export function writeDiscoveryLocation(view: SearchIntent['mode'], state: DiscoveryLocation | null, replace = false) {
  const url = new URL(window.location.href);
  if (state) url.searchParams.set('search', JSON.stringify({ v: 1, view, ...state }));
  else url.searchParams.delete('search');
  if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
