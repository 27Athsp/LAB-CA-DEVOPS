import { useState } from 'react';
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { isMissing, isNumeric, type Dataset, type QualityReport } from '../lib/processor';

interface Props { dataset: Dataset | null; report: QualityReport | null; cleaned: boolean; hasCleaned: boolean; onView: (cleaned: boolean) => void }
const PAGE_SIZE = 8;

export function DataPreview({ dataset, report, cleaned, hasCleaned, onView }: Props) {
  const [page, setPage] = useState(0);
  const lastPage = dataset ? Math.max(0, Math.ceil(dataset.rows.length / PAGE_SIZE) - 1) : 0;
  const currentPage = Math.min(page, lastPage);
  const firstRow = currentPage * PAGE_SIZE;
  const rows = dataset?.rows.slice(firstRow, firstRow + PAGE_SIZE) ?? [];
  return <section aria-labelledby="preview-heading">
    <div className="section-title"><h2 id="preview-heading">Data preview</h2><span className="subtle">{dataset ? `${dataset.headers.length} columns` : 'Your workspace'}</span></div>
    <div className="segmented" aria-label="Preview version">
      <button aria-pressed={!cleaned} onClick={() => { setPage(0); onView(false); }}>Original</button>
      <button aria-pressed={cleaned} disabled={!hasCleaned} onClick={() => { setPage(0); onView(true); }}>Cleaned</button>
    </div>
    {dataset ? <>
      <div className="table-scroll preview-scroll" tabIndex={0} role="region" aria-label={`${cleaned ? 'Cleaned' : 'Original'} data table`}>
        <table className="data-table"><caption className="visually-hidden">{cleaned ? 'Cleaned' : 'Original'} CSV preview</caption><thead><tr>
          <th scope="col" className="row-number">#</th>{dataset.headers.map((header, index) => <th key={index} scope="col" title={header}>{header}</th>)}
        </tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={firstRow + rowIndex}>
          <th scope="row" className="row-number">{firstRow + rowIndex + 1}</th>{row.map((cell, column) => {
            const missing = isMissing(cell);
            const invalid = !missing && report?.byColumn[column].type === 'numeric' && !isNumeric(cell);
            return <td key={column} className={missing ? 'cell-missing' : invalid ? 'cell-invalid' : ''} title={cell}>
              {missing ? <span className="missing-label">Missing</span> : cell}{invalid ? <span className="invalid-label"> · Invalid</span> : null}
            </td>;
          })}</tr>)}</tbody></table>
      </div>
      <div className="pagination"><span>Rows {firstRow + 1}–{Math.min(firstRow + PAGE_SIZE, dataset.rows.length)} of {dataset.rows.length.toLocaleString()}</span>
        <div><button className="icon-button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
          <button className="icon-button" aria-label="Next page" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div>
      </div>
    </> : <div className="empty-preview"><Table2 size={38} strokeWidth={1.2} aria-hidden="true" /><h3>Meet your data, before you change it.</h3><p>Upload a CSV to see its rows and quality checks.<br />Just exploring? Start with our sample dataset.</p></div>}
  </section>;
}
