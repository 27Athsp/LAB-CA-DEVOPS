import { ArrowRight, Check, Download } from 'lucide-react';
import type { CleanOptions, CleanResult, QualityReport } from '../lib/processor';

interface Props {
  options: CleanOptions; onOptions: (options: CleanOptions) => void;
  onClean: () => void; onDownload: () => void; hasData: boolean; busy: boolean;
  result: CleanResult | null; before: QualityReport | null; after: QualityReport | null;
}

export function CleaningPanel({ options, onOptions, onClean, onDownload, hasData, busy, result, before, after }: Props) {
  return <aside className="cleaning-panel" aria-labelledby="clean-heading"><h2 id="clean-heading">Clean your data</h2><p className="panel-intro">Small fixes. Original file preserved.</p>
    <fieldset disabled={!hasData || busy}><legend className="visually-hidden">Cleaning options</legend>
      <label className="option"><input type="checkbox" checked={options.removeDuplicates} onChange={(event) => onOptions({ ...options, removeDuplicates: event.target.checked })} /><span><strong>Remove duplicate rows</strong><span>Keep the first occurrence of each identical row.</span></span></label>
      <label className="option"><input type="checkbox" checked={options.fillMissing} onChange={(event) => onOptions({ ...options, fillMissing: event.target.checked })} /><span><strong>Fill missing values</strong><span>Median for numbers. Most common value for text. Empty columns stay blank.</span></span></label>
    </fieldset>
    <button className="button primary full-width" disabled={!hasData || busy || (!options.fillMissing && !options.removeDuplicates)} onClick={onClean}>{busy ? 'Processing…' : 'Clean data'}<ArrowRight size={17} aria-hidden="true" /></button>
    <p className="panel-note">Invalid values are flagged, never replaced.</p>
    {result && before && after ? <div className="clean-result" role="status">
      <h3><Check size={17} aria-hidden="true" /> Cleaning complete</h3><p>{result.removedRows} {result.removedRows === 1 ? 'row' : 'rows'} removed · {result.filledCells} {result.filledCells === 1 ? 'cell' : 'cells'} filled</p>
      <table aria-label="Before and after cleaning"><thead><tr><th scope="col">Metric</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>
        <tr><th scope="row">Rows</th><td>{before.rows}</td><td>{after.rows}</td></tr>
        <tr><th scope="row">Missing</th><td>{before.missingCells}</td><td>{after.missingCells}</td></tr>
        <tr><th scope="row">Duplicates</th><td>{before.duplicateRows}</td><td>{after.duplicateRows}</td></tr>
        <tr><th scope="row">Invalid</th><td>{before.invalidNumericCells}</td><td>{after.invalidNumericCells}</td></tr>
      </tbody></table>
      {after.missingCells || after.invalidNumericCells ? <p className="remaining-note">Some values need a manual review. Empty columns and invalid values are preserved.</p> : null}
    </div> : null}
    <div className="download-area"><button className="button secondary full-width" disabled={!result || busy} onClick={onDownload}><Download size={17} aria-hidden="true" />Download cleaned CSV</button><p>{result ? 'Ready to use. Formula-like text is escaped for spreadsheet safety.' : 'Your download will be ready after cleaning.'}</p></div>
  </aside>;
}
