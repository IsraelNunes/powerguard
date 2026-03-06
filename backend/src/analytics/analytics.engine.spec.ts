import { RiskLevel } from '@prisma/client';
import { calculateFeatureStats, evaluatePoint, getRiskLevel } from './analytics.engine';

describe('analytics.engine', () => {
  it('maps risk level thresholds correctly', () => {
    expect(getRiskLevel(10)).toBe(RiskLevel.LOW);
    expect(getRiskLevel(30)).toBe(RiskLevel.MEDIUM);
    expect(getRiskLevel(60)).toBe(RiskLevel.HIGH);
    expect(getRiskLevel(80)).toBe(RiskLevel.CRITICAL);
  });

  it('flags anomaly and returns high risk for overload profile', () => {
    const baseline = Array.from({ length: 60 }).map((_, idx) => ({
      voltage: 220 + Math.sin(idx / 10) * 0.5,
      current: 80 + Math.cos(idx / 8) * 1.2,
      power: 17600 + Math.sin(idx / 6) * 120,
      frequency: 60 + Math.sin(idx / 12) * 0.02,
      temperature: 45 + Math.cos(idx / 10) * 0.7
    }));

    const stats = calculateFeatureStats(baseline);

    const evaluated = evaluatePoint(
      {
        voltage: 206,
        current: 132,
        power: 27200,
        frequency: 59.7,
        temperature: 78
      },
      stats
    );

    expect(evaluated.isAnomaly).toBe(true);
    expect(evaluated.riskScore).toBeGreaterThanOrEqual(50);
    expect([RiskLevel.HIGH, RiskLevel.CRITICAL]).toContain(evaluated.riskLevel);
    expect(evaluated.featureImpact.current).toBeGreaterThan(0);
    expect(evaluated.featureImpact.temperature).toBeGreaterThan(0);
  });
});
