import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { timeAgo, fmtPct, fmtMs } from '../utils';
import StatusBadge from '../components/StatusBadge';
import MonitorForm from '../components/MonitorForm';

const REFRESH_MS = 30000;

export default function Dashboard() {
  const { logout } = useAuth();
  const [monitors, setMonitors] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setMonitors(await api('/monitors'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function togglePause(m) {
    try {
      await api(`/monitors/${m.id}`, {
        method: 'PUT',
        body: {
          name: m.name,
          url: m.url,
          interval_seconds: m.interval_seconds,
          timeout_ms: m.timeout_ms,
          expected_status: m.expected_status,
          is_paused: !m.is_paused,
        },
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSaved() {
    setShowForm(false);
    load();
    setTimeout(load, 7000); 
  }

  const list = monitors ?? [];
  const active = list.filter((m) => !m.is_paused);
  const up = active.filter((m) => m.status === 'up').length;
  const down = active.filter((m) => m.status === 'down').length;
  const withUptime = list.filter((m) => m.uptime_24h != null);
  const avgUptime = withUptime.length
    ? (withUptime.reduce((sum, m) => sum + m.uptime_24h, 0) / withUptime.length).toFixed(2)
    : null;

  return (
    <div className="container">
      <header className="topbar">
        <h1>Uptime Monitor</h1>
        <div className="row">
          <button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : 'Add monitor'}
          </button>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="cards">
        <div className="card">
          <span className="muted">Monitors</span>
          <strong>{list.length}</strong>
        </div>
        <div className="card">
          <span className="muted">Up</span>
          <strong className="positive">{up}</strong>
        </div>
        <div className="card">
          <span className="muted">Down</span>
          <strong className={down > 0 ? 'negative' : ''}>{down}</strong>
        </div>
        <div className="card">
          <span className="muted">Avg uptime (24h)</span>
          <strong>{fmtPct(avgUptime)}</strong>
        </div>
      </div>

      {showForm && (
        <section className="panel">
          <MonitorForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
        </section>
      )}

      <section className="panel">
        <h2>Your monitors</h2>
        {monitors === null ? (
          <p className="muted">Loading...</p>
        ) : list.length === 0 ? (
          <p className="muted">No monitors yet. Click "Add monitor" to create one.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Monitor</th>
                  <th className="right">Uptime (24h)</th>
                  <th className="right">Avg response</th>
                  <th>Last check</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td><StatusBadge status={m.status} paused={m.is_paused} /></td>
                    <td>
                      <Link to={`/monitors/${m.id}`} className="monitor-name">{m.name}</Link>
                      <div className="muted small">{m.url}</div>
                    </td>
                    <td className="right">{fmtPct(m.uptime_24h)}</td>
                    <td className="right">{fmtMs(m.avg_response_24h)}</td>
                    <td>{timeAgo(m.last_checked_at)}</td>
                    <td className="actions">
                      <button className="link" onClick={() => togglePause(m)}>
                        {m.is_paused ? 'Resume' : 'Pause'}
                      </button>
                    </td>
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