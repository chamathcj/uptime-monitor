import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtPct, fmtMs, fmtDuration, displayStatus } from '../utils';
import StatusBadge from '../components/StatusBadge';
import MonitorForm from '../components/MonitorForm';
import ResponseChart from '../components/ResponseChart';

const REFRESH_MS = 30000;
const RANGES = ['24h', '7d', '30d'];

export default function MonitorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [monitor, setMonitor] = useState(null);
  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [checks, setChecks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [range, setRange] = useState('24h');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, s, r, c, i] = await Promise.all([
        api(`/monitors/${id}`),
        api(`/monitors/${id}/stats`),
        api(`/monitors/${id}/response-times?range=${range}`),
        api(`/monitors/${id}/checks?limit=20`),
        api(`/monitors/${id}/incidents`),
      ]);
      setMonitor(m);
      setStats(s);
      setSeries(r);
      setChecks(c);
      setIncidents(i);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id, range]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function togglePause() {
    try {
      await api(`/monitors/${id}`, {
        method: 'PATCH',
        body: { is_paused: !monitor.is_paused },
      });
      load();
      setTimeout(load, 7000); 
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this monitor and all its history?')) return;
    try {
      await api(`/monitors/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!monitor) {
    return (
      <div className="container">
        <Link to="/" className="back">← All monitors</Link>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
      </div>
    );
  }

  return (
    <div className="container">
      <Link to="/" className="back">← All monitors</Link>

      <header className="topbar">
        <div>
          <h1>{monitor.name}</h1>
          <a href={monitor.url} target="_blank" rel="noopener noreferrer" className="muted small">
            {monitor.url}
          </a>
          <div className="muted small">
            Alerts {monitor.alerts_enabled ? 'on' : 'off'} · declared down after{' '}
            {monitor.failure_threshold} failed {monitor.failure_threshold === 1 ? 'check' : 'checks'} in a row
          </div>
        </div>
        <div className="row">
          <StatusBadge status={displayStatus(monitor)} />
          <button className="secondary" onClick={() => setEditing((e) => !e)}>Edit</button>
          <button className="secondary" onClick={togglePause}>
            {monitor.is_paused ? 'Resume' : 'Pause'}
          </button>
          <button className="danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {editing && (
        <section className="panel">
          <MonitorForm
            editing={monitor}
            onSaved={() => {
              setEditing(false);
              load();
              setTimeout(load, 7000); 
            }}
            onCancel={() => setEditing(false)}
          />
        </section>
      )}

      <div className="cards cards-5">
        <div className="card"><span className="muted">Uptime (24h)</span><strong>{fmtPct(stats?.uptime_24h)}</strong></div>
        <div className="card"><span className="muted">Uptime (7d)</span><strong>{fmtPct(stats?.uptime_7d)}</strong></div>
        <div className="card"><span className="muted">Uptime (30d)</span><strong>{fmtPct(stats?.uptime_30d)}</strong></div>
        <div className="card"><span className="muted">Avg response (24h)</span><strong>{fmtMs(stats?.avg_response_24h)}</strong></div>
        <div className="card"><span className="muted">p95 response (24h)</span><strong>{fmtMs(stats?.p95_response_24h)}</strong></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Response time</h2>
          <div className="tabs">
            {RANGES.map((r) => (
              <button
                key={r}
                className={`tab ${r === range ? 'active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponseChart data={series} range={range} />
      </section>

      <section className="panel">
        <h2>Incidents</h2>
        {incidents.length === 0 ? (
          <p className="muted">No incidents. This monitor has not been declared down.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Resolved</th>
                  <th>Duration</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id}>
                    <td>{new Date(i.started_at).toLocaleString()}</td>
                    <td>
                      {i.resolved_at ? (
                        new Date(i.resolved_at).toLocaleString()
                      ) : (
                        <span className="negative">Ongoing</span>
                      )}
                    </td>
                    <td>{fmtDuration(i.duration_seconds)}</td>
                    <td className="muted">{i.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Recent checks</h2>
        {checks.length === 0 ? (
          <p className="muted">No checks yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Status code</th>
                  <th className="right">Response</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.checked_at).toLocaleString()}</td>
                    <td className={c.ok ? 'positive' : 'negative'}>{c.ok ? 'OK' : 'Failed'}</td>
                    <td>{c.status_code ?? '–'}</td>
                    <td className="right">{fmtMs(c.response_time_ms)}</td>
                    <td className="muted">{c.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}