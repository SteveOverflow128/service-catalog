import { useEffect, useMemo, useState } from 'react';
import type { CatalogIndex } from '../data/catalog';
import type { Service } from '../types';
import { CSV_FIELDS, DEFAULT_CSV_FIELDS, csvRowCount, toCsv, type CsvField } from '../data/csv';
import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon } from './icons';

function FieldChip({ field, on, onToggle }: { field: CsvField; on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`csv-field ${on ? 'csv-field--on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={field.hint}
    >
      <span className="csv-field__box">{on && <CheckIcon width={11} height={11} />}</span>
      <span className="csv-field__key mono">{field.key}</span>
      {field.list && <span className="csv-field__tag">list</span>}
    </button>
  );
}

export function CsvExport({
  index,
  services,
  title,
  filename,
  onClose,
}: {
  index: CatalogIndex;
  /** Rows to export (mesh = all services; service map = the current neighborhood). */
  services: Service[];
  title: string;
  filename: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_CSV_FIELDS));
  const [copied, setCopied] = useState(false);
  const [byRegion, setByRegion] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const csv = useMemo(() => toCsv(index, services, selected, byRegion), [index, services, selected, byRegion]);
  const colCount = selected.size;
  const rowCount = csvRowCount(services, byRegion);

  const toggle = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = csv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const defaults = CSV_FIELDS.filter((f) => f.default || f.promoted);
  const additional = CSV_FIELDS.filter((f) => !f.default && !f.promoted);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="CSV export">
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div>
            <span className="overline">
              CSV · {colCount} column{colCount === 1 ? '' : 's'} × {rowCount} rows
            </span>
            <h3 className="modal__title h-display">{title}</h3>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon width={16} height={16} />
          </button>
        </header>

        <div className="csv-picker">
          <span className="csv-group__label overline">Rows</span>
          <div className="csv-group">
            <button
              className={`csv-field ${byRegion ? 'csv-field--on' : ''}`}
              onClick={() => setByRegion((v) => !v)}
              aria-pressed={byRegion}
              title="Emit one row per resource region; resource columns scope to that region."
            >
              <span className="csv-field__box">{byRegion && <CheckIcon width={11} height={11} />}</span>
              <span className="csv-field__key mono">one row per region</span>
            </button>
          </div>
          <div className="csv-picker__bar">
            <span className="overline">Columns</span>
            <div className="csv-picker__quick">
              <button className="linkbtn" onClick={() => setSelected(new Set(CSV_FIELDS.map((f) => f.key)))}>
                all
              </button>
              <button className="linkbtn" onClick={() => setSelected(new Set(DEFAULT_CSV_FIELDS))}>
                defaults
              </button>
              <button className="linkbtn" onClick={() => setSelected(new Set())}>
                none
              </button>
            </div>
          </div>
          <div className="csv-group">
            {defaults.map((f) => (
              <FieldChip key={f.key} field={f} on={selected.has(f.key)} onToggle={() => toggle(f.key)} />
            ))}
          </div>
          <span className="csv-group__label overline">Additional</span>
          <div className="csv-group">
            {additional.map((f) => (
              <FieldChip key={f.key} field={f} on={selected.has(f.key)} onToggle={() => toggle(f.key)} />
            ))}
          </div>
        </div>

        {colCount === 0 ? (
          <div className="csv-empty">Select at least one column to build the export.</div>
        ) : (
          <pre className="modal__code mono">
            <code>{csv}</code>
          </pre>
        )}

        <footer className="modal__foot">
          <span className="modal__hint mono">
            {byRegion ? `${rowCount} rows · one per region` : `${rowCount} services · one row each`}
          </span>
          <div className="modal__actions">
            <button className="btn" onClick={download} disabled={colCount === 0}>
              <DownloadIcon width={15} height={15} />
              Download .csv
            </button>
            <button className={`btn btn--primary ${copied ? 'btn--ok' : ''}`} onClick={copy} disabled={colCount === 0}>
              {copied ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
