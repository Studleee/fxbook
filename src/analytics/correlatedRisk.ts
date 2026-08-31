import type { Position } from '../models';
import type { CorrelationCell, CorrelatedCluster } from './types';
import { classifyPositionRelationship, correlationAt } from './correlation';
export function calculateCorrelatedRiskScore(weightA: number, weightB: number, correlation: number): number {
  return weightA * weightB * Math.abs(correlation);
}

export function detectCorrelatedClusters(args: {
  positions: Position[];
  matrix: CorrelationCell[];
  threshold?: number;
}): CorrelatedCluster[] {
  const threshold = args.threshold ?? 0.65;
  if (args.positions.length < 2) return [];

  const gross = args.positions.reduce((s, p) => s + p.units, 0) || 1;
  const clusters: CorrelatedCluster[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < args.positions.length; i++) {
    for (let j = i + 1; j < args.positions.length; j++) {
      const a = args.positions[i];
      const b = args.positions[j];
      const corr = correlationAt(args.matrix, a.pair, b.pair);
      if (corr == null || Math.abs(corr) < threshold) continue;

      const relationship = classifyPositionRelationship(a, b, corr);
      if (relationship !== 'REINFORCING') continue;

      const key = [a.pair, b.pair].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const score = calculateCorrelatedRiskScore(a.units / gross, b.units / gross, Math.abs(corr));
      const exposurePct = ((a.units + b.units) / gross) * 100;
      clusters.push({
        id: key,
        label: `${a.pair} / ${b.pair}`,
        pairs: [a.pair, b.pair],
        positionIds: [a.id, b.id],
        score,
        exposurePct,
        level: score >= 0.25 || exposurePct >= 40 ? 'HIGH' : score >= 0.12 ? 'MEDIUM' : 'LOW',
      });
    }
  }

  return clusters.sort((x, y) => y.score - x.score);
}

export function mergeClustersIntoThemes(clusters: CorrelatedCluster[]): CorrelatedCluster[] {
  if (!clusters.length) return [];
  const usdPairs = clusters.filter((c) =>
    c.pairs.some((p) => p.includes('USD') || p.endsWith('/USD')),
  );
  if (usdPairs.length >= 2) {
    const pairs = [...new Set(usdPairs.flatMap((c) => c.pairs))];
    const positionIds = [...new Set(usdPairs.flatMap((c) => c.positionIds))];
    const score = usdPairs.reduce((s, c) => s + c.score, 0);
    const exposurePct = usdPairs.reduce((s, c) => s + c.exposurePct, 0);
    return [
      {
        id: 'usd-cluster',
        label: 'HIGH CORRELATED USD CLUSTER',
        pairs,
        positionIds,
        score,
        exposurePct: Math.min(100, exposurePct),
        level: 'HIGH',
      },
      ...clusters.filter((c) => !usdPairs.includes(c)),
    ];
  }
  return clusters;
}
