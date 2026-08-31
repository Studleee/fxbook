import type { Position, Quote } from '../../models';
import { splitPair, conversionRatesForBook } from '../../fx/pips';
import { currencyAmountToAccount } from '../portfolio/exposure';
import { calculateBookMetrics } from '../portfolio/bookMetrics';
import { stdDev } from '../../analytics/math';
import { activeFactorsInBook, buildFactorExposures, exposureVector } from './exposure';
import { buildFactorReturnSeries, buildPortfolioReturnSeries } from './factorReturns';
import { buildFactorCovarianceMatrix, covarianceMetadataFrom } from './covariance';
import {
  calculateFactorPortfolioVariance,
  scaleCovarianceHorizon,
} from './portfolioVariance';
import {
  calculateFactorRiskContributions,
  largestRiskFactor,
} from './riskContribution';
import { calculateParametricVaR, calculateRiskUtilizationFromVaR } from './varEngine';
import { enrichFactorVolChanges } from './factorVol';
import { HOURS_PER_DAY } from './constants';
import type {
  CalculateRiskSnapshotArgs,
  PositionFactorRisk,
  RiskRegime,
  RiskSnapshot,
  RiskWarning,
} from './types';

function classifyRegime(volPct: number | null): RiskRegime {
  if (volPct == null) return 'INSUFFICIENT_DATA';
  if (volPct < 0.15) return 'LOW';
  if (volPct < 0.35) return 'NORMAL';
  if (volPct < 0.75) return 'HIGH';
  return 'EXTREME';
}

function buildPositionFactorRisk(args: {
  positions: Position[];
  quotes: Record<string, Quote>;
  accountCurrency: string;
  equity: number;
  portfolioVol: number | null;
  var95: number | null;
}): PositionFactorRisk[] {
  const rates = conversionRatesForBook(args.quotes, args.positions);
  let totalWeight = 0;
  const weights: { position: Position; weight: number }[] = [];

  for (const pos of args.positions) {
    const [base, quote] = splitPair(pos.pair);
    const sign = pos.side === 'LONG' ? 1 : -1;
    const legs = [
      { ccy: base, native: sign * pos.units },
      { ccy: quote, native: -sign * pos.units * pos.current },
    ];
    let w = 0;
    for (const leg of legs) {
      const acct = currencyAmountToAccount({
        amount: leg.native,
        currency: leg.ccy,
        accountCurrency: args.accountCurrency,
        conversionRates: rates,
      });
      if (acct != null) w += Math.abs(acct);
    }
    weights.push({ position: pos, weight: w });
    totalWeight += w;
  }

  return weights.map(({ position, weight }) => {
    const share = totalWeight > 0 ? weight / totalWeight : 0;
    const var95 =
      args.var95 != null && Number.isFinite(args.var95) ? Math.abs(args.var95) * share : null;
    const expectedMove =
      args.portfolioVol != null && Number.isFinite(args.portfolioVol)
        ? args.portfolioVol * share
        : null;
    return {
      positionId: position.id,
      pair: position.pair,
      side: position.side,
      units: position.units,
      unrealizedPnL: position.unrealizedPnl,
      accountExposure: weight > 0 ? weight : null,
      riskContributionPct: totalWeight > 0 ? share * 100 : null,
      expectedMove,
      var95,
    };
  });
}

function buildWarnings(args: {
  dataComplete: boolean;
  observations: number;
  largestFactor: string | null;
  topContributionPct: number | null;
}): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  if (!args.dataComplete) {
    warnings.push({
      severity: 'WATCH',
      code: 'INSUFFICIENT_DATA',
      message: 'Factor covariance requires more historical observations.',
    });
  }
  if (args.largestFactor && args.topContributionPct != null && args.topContributionPct > 30) {
    warnings.push({
      severity: 'INFO',
      code: 'CONCENTRATION',
      message: `${args.largestFactor} is the largest portfolio risk factor.`,
      factor: args.largestFactor,
    });
  }
  return warnings;
}

export function calculateRiskSnapshot(args: CalculateRiskSnapshotArgs): RiskSnapshot {
  const nowMs = args.nowMs ?? Date.now();
  const balance = args.balance ?? args.equity;
  const pairs = [...new Set(args.positions.map((p) => p.pair))];
  const activeFactors = activeFactorsInBook(args.positions);
  const factorExposures = buildFactorExposures({
    positions: args.positions,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
  });

  const dataComplete =
    args.positions.length === 0
      ? true
      : factorExposures.filter((e) => e.netNative !== 0).every((e) => e.conversionComplete);

  const factorSeries =
    activeFactors.length > 0
      ? buildFactorReturnSeries({
          factors: activeFactors,
          pairs,
          candlesByPair: args.candlesByPair,
          nowSec: Math.floor(nowMs / 1000),
        })
      : null;

  const factorCov = factorSeries
    ? buildFactorCovarianceMatrix({ factorSeries, nowMs })
    : null;

  const exposureVec = exposureVector(factorExposures, activeFactors);
  const exposuresNumeric = exposureVec.map((v) => v ?? 0);

  let portfolioVariance1h = calculateFactorPortfolioVariance({
    exposures: exposureVec,
    covariance: factorCov ?? emptyCovariance(activeFactors),
    equity: args.equity,
  });

  if (!factorCov) {
    portfolioVariance1h = {
      variance: null,
      portfolioVol: null,
      portfolioVolPct: null,
      specificRiskVariance: 0,
    };
  }

  const cov1d = factorCov ? scaleCovarianceHorizon(factorCov, 1, HOURS_PER_DAY) : null;
  const portfolioVariance1d =
    cov1d != null
      ? calculateFactorPortfolioVariance({
          exposures: exposureVec,
          covariance: cov1d,
          equity: args.equity,
        })
      : portfolioVariance1h;

  const portfolioVol = portfolioVariance1d.portfolioVol;
  const portfolioVolPct = portfolioVariance1d.portfolioVolPct;

  let realizedVolPct: number | null = null;
  if (factorSeries && args.equity > 0) {
    const portReturns = buildPortfolioReturnSeries({
      factorSeries,
      exposures: exposuresNumeric,
      equity: args.equity,
    });
    const sigma = stdDev(portReturns);
    if (sigma != null) {
      realizedVolPct = sigma * Math.sqrt(HOURS_PER_DAY) * 100;
    }
  }

  let factorRisk =
    factorCov && portfolioVariance1h.variance != null && portfolioVariance1h.variance > 0
      ? calculateFactorRiskContributions({
          exposures: exposureVec,
          covariance: factorCov,
          portfolioVariance: portfolioVariance1h.variance,
        })
      : activeFactors.map((factor) => ({
          factor,
          marginalRisk: null,
          componentVariance: null,
          riskContributionPct: null,
          currentVol: null,
          forecastVol: null,
          volChangePct: null,
        }));

  factorRisk = enrichFactorVolChanges(factorRisk, factorSeries);

  const largestFactor = largestRiskFactor(factorRisk);
  const topContribution = factorRisk.find((f) => f.factor === largestFactor)?.riskContributionPct ?? null;

  const var95 = calculateParametricVaR({
    portfolioVol,
    equity: args.equity,
    confidence: 0.95,
    horizonDays: 1,
  });
  const var99 = calculateParametricVaR({
    portfolioVol,
    equity: args.equity,
    confidence: 0.99,
    horizonDays: 1,
  });

  const { utilization, capacity } = calculateRiskUtilizationFromVaR({
    currentVaR: var95.valueAtRisk,
    riskBudgetVaR:
      args.riskBudgetVaR ??
      (args.maxCurrencyShockRiskPct != null && args.equity > 0
        ? (args.maxCurrencyShockRiskPct / 100) * args.equity
        : null),
  });

  const shockMetrics = calculateBookMetrics({
    positions: args.positions,
    quotes: args.quotes,
    equity: args.equity,
    accountCurrency: args.accountCurrency,
    shockPercent: args.shockPercent,
    maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
  });

  const positionRisk = buildPositionFactorRisk({
    positions: args.positions,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
    equity: args.equity,
    portfolioVol,
    var95: var95.valueAtRisk,
  });

  const warnings = buildWarnings({
    dataComplete: dataComplete && factorCov != null,
    observations: factorCov?.observationCount ?? 0,
    largestFactor,
    topContributionPct: topContribution,
  });

  return {
    timestamp: new Date(nowMs).toISOString(),
    equity: args.equity,
    balance,
    accountCurrency: args.accountCurrency,

    portfolioVol,
    portfolioVolPct,
    realizedVol: realizedVolPct != null ? (realizedVolPct / 100) * args.equity : null,
    realizedVolPct,
    forecastVol: portfolioVol,
    forecastVolPct: portfolioVolPct,
    forecastChangePct:
      realizedVolPct != null && portfolioVolPct != null && realizedVolPct > 0
        ? ((portfolioVolPct - realizedVolPct) / realizedVolPct) * 100
        : null,

    var95,
    var99,

    expectedMove: portfolioVol,
    expectedMovePct: portfolioVolPct,
    stressLoss: shockMetrics.worstShock?.bookImpact ?? null,

    riskUtilization: utilization,
    capacity,
    riskBudgetVaR:
      args.riskBudgetVaR ??
      (args.maxCurrencyShockRiskPct != null && args.equity > 0
        ? (args.maxCurrencyShockRiskPct / 100) * args.equity
        : null),

    largestRiskFactor: largestFactor,
    regime: classifyRegime(portfolioVolPct),

    factorExposures,
    factorRisk,
    positionRisk,

    covariance: factorCov,
    covarianceMetadata: factorCov ? covarianceMetadataFrom(factorCov) : null,

    warnings,
    dataComplete: dataComplete && factorCov != null,
  };
}

function emptyCovariance(factors: string[]): import('./types').FactorCovarianceMatrix {
  const n = factors.length;
  return {
    factors,
    covariances: Array.from({ length: n }, () => Array(n).fill(0)),
    correlations: Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ),
    volatilities: Array(n).fill(0),
    observationCount: 0,
    lookbackDays: 0,
    method: 'ROLLING',
    matrixHealth: 'INSUFFICIENT_DATA',
    lastUpdated: Date.now(),
  };
}
