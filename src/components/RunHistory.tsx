import { useEffect, useRef, useState } from 'react';
import { getRuns, saveRun, type HistoryConfig, type RunSummary, type SavedRun } from '../lib/history';

export function RunHistory({ config, summary }: { config: HistoryConfig; summary: RunSummary | null }) {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [save, setSave] = useState<{ id: string; status: 'saving' | 'saved' | 'error' } | null>(null);
  const request = useRef(0);
  const status = save?.id === summary?.id ? save?.status : undefined;

  async function refresh() {
    const id = ++request.current;
    setLoading(true);
    try {
      const next = await getRuns(config);
      if (id === request.current) { setRuns(next); setUnavailable(false); }
    } catch { if (id === request.current) setUnavailable(true); }
    finally { if (id === request.current) setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    return () => { request.current++; };
  }, [config.apiUrl]);

  async function saveSummary() {
    if (!summary || status === 'saving' || status === 'saved') return;
    const current = summary;
    setSave({ id: current.id, status: 'saving' });
    try {
      const saved = await saveRun(config, current);
      request.current++;
      setLoading(false);
      setRuns((previous) => [saved, ...previous.filter((run) => run.id !== saved.id)]);
      setSave((previous) => previous?.id === current.id ? { id: current.id, status: 'saved' } : previous);
    } catch { setSave((previous) => previous?.id === current.id ? { id: current.id, status: 'error' } : previous); }
  }

  return <section className="run-history" aria-labelledby="history-heading">
    <div className="history-heading"><div><h2 id="history-heading">Run history</h2><p>Save a summary of a completed clean. CSV contents and file names stay in your browser.</p></div>
      <div className="history-actions"><button className="button secondary" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh history'}</button><button className="button primary" onClick={() => void saveSummary()} disabled={!summary || status === 'saving' || status === 'saved'}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Retry save' : 'Save run'}</button></div>
    </div>
    <div className="history-status" role="status" aria-live="polite">{status === 'error' ? <p>Couldn’t save this run. Retry when the service is available. You can still clean and download your CSV.</p> : status === 'saved' ? <p>Run saved.</p> : null}{unavailable ? <p>History is unavailable. You can still clean and download your CSV. Use Refresh history to try again.</p> : null}</div>
    {runs.length ? <div className="table-scroll" role="region" aria-label="Run history table" tabIndex={0}><table aria-label="Saved cleaning runs"><thead><tr><th scope="col">Saved</th><th scope="col">Rows</th><th scope="col">Missing cells</th><th scope="col">Duplicate rows</th><th scope="col">Version</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} data-run-id={run.id}><th scope="row"><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time></th><td>{run.inputRows.toLocaleString()} → {run.outputRows.toLocaleString()}</td><td>{run.missingBefore.toLocaleString()} → {run.missingAfter.toLocaleString()}</td><td>{run.duplicatesBefore.toLocaleString()} → {run.duplicatesAfter.toLocaleString()}</td><td>{run.appVersion}</td></tr>)}</tbody></table></div> : !loading && !unavailable ? <p className="history-empty">No saved runs yet. Clean a CSV, then choose Save run.</p> : null}
  </section>;
}
