import { useRef, useState } from 'react';
import { AlertCircle, FileText, LockKeyhole, X } from 'lucide-react';
import { UploadArea } from './components/UploadArea';
import { DataPreview } from './components/DataPreview';
import { Metrics, QualityReport } from './components/QualityReport';
import { CleaningPanel } from './components/CleaningPanel';
import { analyzeDataset, cleanDataset, DEFAULT_OPTIONS, parseCsv, serializeCsv, validateFile, type CleanOptions, type CleanResult, type Dataset, type QualityReport as Report } from './lib/processor';
import sampleCsv from '../sample_data.csv?raw';

interface LoadedFile { id: number; name: string; dataset: Dataset; report: Report; sample: boolean }
interface Result { cleaned: CleanResult; report: Report }

export default function App() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_OPTIONS);
  const [showCleaned, setShowCleaned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const operation = useRef(0);

  function clear() {
    operation.current++;
    setFile(null); setResult(null); setShowCleaned(false); setError(''); setBusy(false); setAnnouncement('Workspace cleared. Choose another CSV.');
  }

  function loadText(text: string, name: string, sample = false) {
    const dataset = parseCsv(text);
    const report = analyzeDataset(dataset);
    setFile({ id: operation.current, name, dataset, report, sample }); setResult(null); setShowCleaned(false);
    setAnnouncement(`${name} loaded. ${report.rows} rows, ${report.columns} columns, ${report.missingCells} missing cells and ${report.duplicateRows} duplicate rows.`);
  }

  async function upload(incoming: File) {
    clear();
    const id = operation.current;
    setBusy(true); setAnnouncement('Reading CSV.');
    try {
      validateFile(incoming);
      const buffer = await incoming.arrayBuffer();
      if (id !== operation.current) return;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new Error('This file is not UTF-8. Export it as CSV UTF-8 and try again.'); }
      loadText(text, incoming.name);
    } catch (problem) { if (id === operation.current) { setError(problem instanceof Error ? problem.message : 'Could not read this CSV. Please try another file.'); setAnnouncement(''); } }
    finally { if (id === operation.current) setBusy(false); }
  }

  function changeOptions(next: CleanOptions) {
    setOptions(next); setResult(null); setShowCleaned(false); setAnnouncement('Options changed. Clean the original data again to update your download.');
  }

  function clean() {
    if (!file) return;
    const cleaned = cleanDataset(file.dataset, options);
    setResult({ cleaned, report: analyzeDataset(cleaned.dataset) }); setShowCleaned(true); setAnnouncement('Cleaning complete. Your CSV is ready to download.');
  }

  function download() {
    if (!file || !result) return;
    const blob = new Blob(['\uFEFF', serializeCsv(result.cleaned.dataset)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${file.name.replace(/\.csv$/i, '')}_cleaned.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement('Cleaned CSV download started.');
  }

  const activeData = showCleaned && result ? result.cleaned.dataset : file?.dataset ?? null;
  const activeReport = showCleaned && result ? result.report : file?.report ?? null;

  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="/" aria-label="ClearCSV home"><img src="/favicon.svg" alt="" width="25" height="25" />ClearCSV</a><span className="privacy"><LockKeyhole size={16} aria-hidden="true" />Files stay in your browser</span></div></header>
    <main id="workspace" className="workspace" aria-busy={busy}>
      <div className="page-heading"><h1>A clean start for your data.</h1><p>Inspect, clean, and export your CSV in one workspace.</p></div>
      <UploadArea onFile={upload} busy={busy} onSample={() => { clear(); loadText(sampleCsv, 'sample_data.csv', true); }} />
      <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>
      {error ? <div className="error-message" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>We couldn’t open that file</strong><p>{error}</p></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18} /></button></div> : null}
      {file ? <><div className="file-bar"><FileText size={22} aria-hidden="true" /><div><strong title={file.name}>{file.name}</strong><span>{file.report.rows.toLocaleString()} rows · {file.report.columns} columns{file.sample ? ' · Sample dataset' : ''}</span></div><button className="icon-button" aria-label="Remove file" onClick={clear}><X size={19} /></button></div><Metrics report={activeReport!} /></> : null}
      <div className={`workspace-grid ${file ? '' : 'workspace-empty'}`}>
        <div className="data-panel"><DataPreview key={file?.id ?? 'empty'} dataset={activeData} report={activeReport} cleaned={showCleaned} hasCleaned={!!result} onView={setShowCleaned} />
          {activeReport ? <QualityReport report={activeReport} /> : <div className="empty-explainer"><span>Find missing values</span><span>Spot duplicate rows</span><span>Export a cleaner CSV</span></div>}
        </div>
        <CleaningPanel options={options} onOptions={changeOptions} onClean={clean} onDownload={download} hasData={!!file} busy={busy} result={result?.cleaned ?? null} before={file?.report ?? null} after={result?.report ?? null} />
      </div>
      <footer><span>CSV in. Clarity out.</span><span>UTF-8 CSV · No sign-up · No data stored</span></footer>
    </main>
  </>;
}
