import type { PageId } from '../models';

const COPY: Record<Exclude<PageId, 'desk' | 'positions' | 'risk' | 'settings'>, { stage: string; title: string; body: string; items: string[] }> = {
  analytics: {
    stage: 'STAGE 5',
    title: 'ANALYTICS',
    body: 'Equity curve, pair contribution, and rolling health so weak pairs are visible before they damage the book.',
    items: ['Equity / drawdown curves', 'Pair contribution ranking', 'Rolling expectancy and profit factor'],
  },
  journal: {
    stage: 'STAGE 6',
    title: 'JOURNAL / LOGS',
    body: 'Event store is already receiving desk overrides. This page will become the searchable operational journal.',
    items: ['Risk / user / broker / system sources', 'Before / after values', 'Override audit trail'],
  },
};

export function PlaceholderPage({ page }: { page: Exclude<PageId, 'desk' | 'risk' | 'settings'> }) {
  if (page === 'positions') return null;
  const copy = COPY[page];
  return (
    <div className="ph">
      <div className="ph-inner">
        <div className="ph-kicker">{copy.stage}</div>
        <h1 className="ph-title">{copy.title}</h1>
        <p className="ph-body">{copy.body}</p>
        <ul className="ph-list">
          {copy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
