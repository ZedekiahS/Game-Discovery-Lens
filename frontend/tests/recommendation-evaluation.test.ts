import { describe, expect, it } from 'vitest';
import { evaluateRecommendations } from './recommendation-evaluation';
describe('fixed editorial recommendation scenarios', () => {
  const report = evaluateRecommendations();
  it.each(report.rows)('$id preserves eligibility and inspectable evidence', row => {
    expect(row.violations).toEqual([]);
  });
});
