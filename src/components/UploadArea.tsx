import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface Props { onFile: (file: File) => void; onSample: () => void; busy: boolean }

export function UploadArea({ onFile, onSample, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <section className={`upload-area ${dragging ? 'dragging' : ''}`} aria-label="Upload CSV"
    onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]); }}>
    <div className="upload-copy"><Upload size={29} strokeWidth={1.7} aria-hidden="true" /><div>
      <h2>{busy ? 'Working on your data…' : 'Drop a CSV here'}</h2>
      <p>or choose a file · up to 5 MB</p>
    </div></div>
    <div className="upload-actions">
      <input ref={input} className="visually-hidden" type="file" tabIndex={-1} accept=".csv,text/csv" aria-label="Choose CSV file" disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
      <button className="button primary" onClick={() => input.current?.click()} disabled={busy}>Choose CSV</button>
      <button className="button secondary" onClick={onSample} disabled={busy}>Try sample data</button>
    </div>
  </section>;
}
