import { describe, expect, it } from 'vitest';
import { evaluateRecommendations } from './recommendation-evaluation';
import calibration from '../../tests/fixtures/recommendation-calibration.json';
describe('fixed editorial recommendation scenarios', () => {
  const report = evaluateRecommendations();
  it.each(report.rows)('$id preserves eligibility and inspectable evidence', row => {
    expect(row.violations).toEqual([]);
  });
});

describe('new calibration scenarios', () => {
  it.each(evaluateRecommendations(calibration).rows)('$id respects exclusions and backed reasons', row => {
    expect(row.violations).toEqual([]);
  });
});
