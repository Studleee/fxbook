import { formatUnits } from '../../format';
import type { CorrelationSelection } from '../../analytics/types';
import { MIN_CORRELATION_OBSERVATIONS } from '../../analytics/returns';

interface Props {
  selection: CorrelationSelection | null;
}

export function CorrelationDetailPanel({ selection }: Props) {
  if (!selection) {
    return (
      <aside className="corr-detail-panel">
        <div className="corr-detail-h">SELECTED RELATIONSHIP</div>
        <div className="corr-detail-empty">
          Click a matrix cell to inspect correlation and open book direction.
        </div>
      </aside>
    );
  }

  const corr =
    selection.correlation != null ? selection.correlation.toFixed(2) : 'N/A';

  return (
    <aside className="corr-detail-panel">
      <div className="corr-detail-h">SELECTED RELATIONSHIP</div>
      <DetailRow k="PAIR A" v={selection.pairA} />
      <DetailRow k="PAIR B" v={selection.pairB} />
      <DetailRow k="CORRELATION" v={corr} large />
      <DetailRow k="WINDOW" v={selection.window} />
      <DetailRow
        k="OBSERVATION COUNT"
        v={
          selection.observationCount >= MIN_CORRELATION_OBSERVATIONS
            ? String(selection.observationCount)
            : `${selection.observationCount} (N/A < ${MIN_CORRELATION_OBSERVATIONS})`
        }
      />

      <div className="corr-detail-sub">OPEN POSITIONS</div>
      <PositionRow label={selection.pairA} pos={selection.positionA} />
      <PositionRow label={selection.pairB} pos={selection.positionB} />

      {selection.relationship !== 'NOT BOTH OPEN' &&
        selection.relationship !== 'MIXED / NEUTRAL' && (
          <DetailRow k="BOOK EFFECT" v={selection.relationship} />
        )}
    </aside>
  );
}

function DetailRow({ k, v, large }: { k: string; v: string; large?: boolean }) {
  return (
    <div className="corr-detail-row">
      <span className="corr-detail-k">{k}</span>
      <span className={`corr-detail-v ${large ? 'large' : ''}`}>{v}</span>
    </div>
  );
}

function PositionRow({
  label,
  pos,
}: {
  label: string;
  pos: CorrelationSelection['positionA'];
}) {
  if (!pos) {
    return (
      <div className="corr-detail-pos flat">
        <span>{label}</span>
        <span>—</span>
      </div>
    );
  }
  return (
    <div className="corr-detail-pos">
      <span>{label}</span>
      <span>
        {pos.side} {formatUnits(pos.units)}
      </span>
    </div>
  );
}
