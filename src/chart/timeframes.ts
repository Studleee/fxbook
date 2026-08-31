export const CHART_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D'] as const;

export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

export function timeframeSeconds(tf: ChartTimeframe): number {
  switch (tf) {
    case 'M1':
      return 60;
    case 'M5':
      return 300;
    case 'M15':
      return 900;
    case 'M30':
      return 1800;
    case 'H1':
      return 3600;
    case 'H4':
      return 14_400;
    case 'D':
      return 86_400;
  }
}

export function candleCountFor(tf: ChartTimeframe): number {
  switch (tf) {
    case 'M1':
      return 300;
    case 'D':
      return 260;
    default:
      return 180;
  }
}
