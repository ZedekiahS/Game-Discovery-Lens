import catalog from "../../../catalog/demo-catalog.json";
import type { Game } from "../types";

type CatalogRecord = Game & {
  summaryZh: string;
  artwork: {
    appId: number;
    slug: string;
    sourceUrl: string;
  };
};

// Portfolio demo metrics, not live storefront data. Frontend and backend load
// the same catalog so their fixed-data modes cannot silently drift apart.
export const games: Game[] = (catalog as CatalogRecord[]).map((record) => ({
  id: record.id,
  name: record.name,
  price: record.price,
  rating: record.rating,
  reviewCount: record.reviewCount,
  releaseYear: record.releaseYear,
  developer: record.developer,
  publisher: record.publisher,
  tags: record.tags,
  summary: record.summary,
  revenue: record.revenue,
  ownership: record.ownership,
  contentSource: record.contentSource,
  metricsKind: "demo",
}));
