import { useEffect, useState } from 'react';
import type { FlowLayout } from '../graph/flow';
import { flowToCsv } from '../graph/flowCsv';
import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon } from './icons';

export function FlowCsvExport({ layout, filename, onClose }: { layout: FlowLayout; filename: string; onClose: () => void }) {
  const csv = flowToCsv(layout);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const lineCount = csv.split('\n').length;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Flow CSV export">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div>
            <span className="overline">Export flow as CSV</span>
            <h3 className="modal__title h-display">{filename}</h3>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon width={16} height={16} />
          </button>
        </header>

        <pre className="modal__code mono">
          <code>{csv}</code>
        </pre>

        <footer className="modal__foot">
          <span className="modal__hint mono">
            {lineCount} lines · edge list CSV
          </span>
          <div className="modal__actions">
            <button className="btn" onClick={download}>
              <DownloadIcon width={15} height={15} />
              Download {filename}
            </button>
            <button className={`btn btn--primary ${copied ? 'btn--ok' : ''}`} onClick={copy}>
              {copied ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
