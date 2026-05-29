import { edgeColors, tierStyles } from '../design/tokens';

const tierOrder = ['0', '1', '2', '3', '?'];

export function Legend() {
  return (
    <div className="legend">
      <div className="legend__group">
        <span className="overline">Criticality</span>
        <div className="legend__items">
          {tierOrder.map((t) => (
            <span className="legend__item" key={t}>
              <span className="legend__dot" style={{ background: tierStyles[t].color }} />
              {tierStyles[t].short}
            </span>
          ))}
        </div>
      </div>
      <div className="legend__group">
        <span className="overline">Edges</span>
        <div className="legend__items">
          <span className="legend__item">
            <span className="legend__line" style={{ background: edgeColors.critical, height: 3 }} />
            critical
          </span>
          <span className="legend__item">
            <span className="legend__line" style={{ background: edgeColors.normal }} />
            standard
          </span>
          <span className="legend__item">
            <span className="legend__line legend__line--dash" style={{ color: edgeColors.external }} />
            external ↗
          </span>
        </div>
      </div>
    </div>
  );
}
