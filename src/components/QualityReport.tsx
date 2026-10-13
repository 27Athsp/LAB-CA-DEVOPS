import type { QualityReport as Report } from '../lib/processor';

export function Metrics({ report }: { report: Report }) {
  return <dl className="metrics" aria-label="Dataset metrics">{[
    ['Rows', report.rows], ['Columns', report.columns], ['Missing cells', report.missingCells], ['Duplicate rows', report.duplicateRows],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>;
}

export function QualityReport({ report }: { report: Report }) {
  return <section className="quality-section" aria-labelledby="quality-heading">
    <div className="section-title"><h2 id="quality-heading">Column quality</h2><span className="subtle">{report.invalidNumericCells ? `${report.invalidNumericCells} invalid numeric ${report.invalidNumericCells === 1 ? 'value' : 'values'}` : 'No invalid numeric values'}</span></div>
    <div className="table-scroll quality-scroll" tabIndex={0} role="region" aria-label="Column quality table">
      <table><thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col" className="number">Missing</th><th scope="col" className="number">Invalid</th></tr></thead>
        <tbody>{report.byColumn.map((column, index) => <tr key={index}><th scope="row" title={column.name}>{column.name}</th>
          <td>{column.type === 'numeric' ? 'Number' : column.type === 'empty' ? 'Empty' : 'Text'}</td><td className={`number ${column.missing ? 'issue-count' : ''}`}>{column.missing.toLocaleString()}</td><td className={`number ${column.invalid ? 'issue-count' : ''}`}>{column.invalid.toLocaleString()}</td></tr>)}</tbody>
      </table>
    </div>
    <details className="rules"><summary>How are values checked?</summary><p>Blank and whitespace-only cells count as missing. A column is likely numeric when at least 80% of its nonempty values are finite numbers. Leading-zero identifiers stay text. In a numeric column, other values are flagged as invalid and kept unchanged.</p></details>
  </section>;
}
