import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtDuration } from '../utils';

const OVERALL = {
  operational: { label: 'All systems operational', cls: 'ok' },
  degraded: { label: 'Some systems are degraded', cls: 'warn' },
  partial_outage: { label: 'Partial outage', cls: 'bad' },
  major_outage: { label: 'Major outage', cls: 'bad' },
  empty: { label: 'No monitors to show yet', cls: 'empty' },
};

const STATE_LABEL = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  pending: 'Pending',
};

const REFRESH_MS = 60000;

function barClass(uptime) {
  if (uptime == null) return '';
  if (uptime >= 99.9) return 'green';
  if (uptime >= 95) return 'amber';
  return 'red';
}

export default function StatusPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await api(`/public/status/${slug}`);
        if (!cancelled) {
          setData(page);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [slug]);

  if (error && !data) {
    return (
      <div className="status-wrap">
        <h1>Status page not found</h1>
        <p className="muted">This address does not exist.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="status-wrap">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  const overall = OVERALL[data.overall] ?? OVERALL.operational;

  return (
    <div className="status-wrap">
      <header className="status-head">
        <h1>{data.title}</h1>
        {data.description && <p className="muted">{data.description}</p>}
      </header>

      <div className={`banner ${overall.cls}`}>{overall.label}</div>

      {data.monitors.length > 0 && (
        <section className="panel">
          {data.monitors.map((m) => (
            <div className="svc" key={m.name}>
              <div className="svc-top">
                <span className="svc-name">{m.name}</span>
                <span className={`svc-state ${m.status}`}>{STATE_LABEL[m.status]}</span>
              </div>
              <div className="bars">
                {m.days.map((d) => (
                  <div
                    key={d.date}
                    className={`bar ${barClass(d.uptime)}`}
                    title={`${d.date}: ${d.uptime == null ? 'no data' : `${d.uptime}% uptime`}`}
                  />
                ))}
              </div>
              <div className="bars-foot">
                <span>30 days ago</span>
                <span>
                  {m.uptime_30d == null ? 'No data yet' : `${m.uptime_30d}% uptime`}
                </span>
                <span>Today</span>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>Incidents (last 30 days)</h2>
        {data.incidents.length === 0 ? (
          <p className="muted">No incidents in the last 30 days.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.monitor}</td>
                    <td>{new Date(i.started_at).toLocaleString()}</td>
                    <td>
                      {i.resolved_at ? (
                        <span className="positive">Resolved</span>
                      ) : (
                        <span className="negative">Ongoing</span>
                      )}
                    </td>
                    <td>{fmtDuration(i.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="muted small center">
        Last updated {new Date(data.updated_at).toLocaleString()}
      </p>
    </div>
  );
}