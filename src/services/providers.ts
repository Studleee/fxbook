/**
 * Provider contracts. UI talks to these shapes, not to OANDA.
 * Stage 2 risk math lives in src/risk/engine.ts and is applied by the store.
 */
export interface MarketDataProvider {
  id: string;
}

export interface BrokerProvider {
  id: string;
}

export interface StrategyProvider {
  id: string;
}

export interface RiskEngine {
  id: string;
}

export interface EventStore {
  id: string;
}

export const mockProviders = {
  marketData: { id: 'mock-market' } satisfies MarketDataProvider,
  broker: { id: 'mock-broker' } satisfies BrokerProvider,
  strategy: { id: 'mock-strategy' } satisfies StrategyProvider,
  risk: { id: 'governor-v1' } satisfies RiskEngine,
  events: { id: 'memory-events' } satisfies EventStore,
};
