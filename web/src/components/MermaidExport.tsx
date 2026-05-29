import { useEffect, useState } from 'react';
import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon } from './icons';

export function MermaidExport({
  title,
  filename,
  code,
  onClose,
}: {
  title: string;
  filename: string;
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for non-secure contexts where the Clipboard API is unavailable.
      const ta = document.createElement('textarea');
      ta.value = code;
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
    const blob = new Blob([code], { type: 'text/vnd.mermaid;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Mermaid export">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div>
            <span className="overline">Mermaid · flowchart</span>
            <h3 className="modal__title h-display">{title}</h3>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseIcon width={16} height={16} />
          </button>
        </header>

        <pre className="modal__code mono">
          <code>{code}</code>
        </pre>

        <footer className="modal__foot">
          <span className="modal__hint mono">
            {lineCount} lines · paste into any Mermaid renderer, GitHub, or your docs
          </span>
          <div className="modal__actions">
            <button className="btn" onClick={download}>
              <DownloadIcon width={15} height={15} />
              Download .mmd
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
