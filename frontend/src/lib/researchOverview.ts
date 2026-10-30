import type { Game } from "../types";
import { availableTagChoices } from './tagSemantics';

export interface CatalogOverview {
  gameCount: number;
  developerCount: number;
  averagePrice: number | null;
  averageRating: number | null;
  topTags: Array<{ tag: string; count: number }>;
}

// These describe the available catalog, not the size of the wider games market.
export function summarizeCatalog(catalog: readonly Game[]): CatalogOverview {
  const developers = new Set<string>();
  const tagCounts = new Map<string, number>();
  let totalPrice = 0;
  let totalRating = 0;

  for (const game of catalog) {
    const developer = game.developer.trim();
    if (developer) developers.add(developer);
    totalPrice += game.price;
    totalRating += game.rating;
    for (const tag of availableTagChoices(game.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    gameCount: catalog.length,
    developerCount: developers.size,
    averagePrice: catalog.length ? totalPrice / catalog.length : null,
    averageRating: catalog.length ? totalRating / catalog.length : null,
    topTags: [...tagCounts].map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "en"))
      .slice(0, 6),
  };
}

// Review volume gives a repeatable starting point for research, not an opportunity score.
export function researchGames(catalog: readonly Game[]): Game[] {
  return [...catalog].sort((left, right) =>
    right.reviewCount - left.reviewCount ||
    right.rating - left.rating ||
    left.name.localeCompare(right.name, "en") ||
    left.id - right.id,
  ).slice(0, 6);
}
