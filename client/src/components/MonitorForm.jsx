import { useState } from 'react';
import { api } from '../api';
import { INTERVALS } from '../utils';

export default function MonitorForm({ editing, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    url: editing?.url ?? 'https://',
    interval_seconds: editing?.interval_seconds ?? 300,
    expected_status: editing?.expected_status ?? 200,
    timeout_seconds: editing ? Math.round(editing.timeout_ms / 1000) : 10,
    failure_threshold: editing?.failure_threshold ?? 3,
    alerts_enabled: editing?.alerts_enabled ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  
  const current = Number(form.interval_seconds);
  const intervals = INTERVALS.some((i) => i.value === current)
    ? INTERVALS
    : [{ value: current, label: `Every ${current} seconds` }, ...INTERVALS];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body = {
      name: form.name,
      url: form.url,
      interval_seconds: Number(form.interval_seconds),
      expected_status: Number(form.expected_status),
      timeout_ms: Number(form.timeout_seconds) * 1000,
      failure_threshold: Number(form.failure_threshold),
      alerts_enabled: form.alerts_enabled,
      is_paused: editing?.is_paused ?? false,
    };

    try {
      if (editing) {
        await api(`/monitors/${editing.id}`, { method: 'PUT', body });
      } else {
        await api('/monitors', { method: 'POST', body });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>{editing ? 'Edit monitor' : 'Add monitor'}</h2>

      <div className="row">
        <label>
          Name
          <input value={form.name} onChange={set('name')} maxLength={100} required />
        </label>
        <label>
          URL
          <input type="url" value={form.url} onChange={set('url')} required />
        </label>
      </div>

      <div className="row">
        <label>
          Check interval
          <select value={form.interval_seconds} onChange={set('interval_seconds')}>
            {intervals.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </label>
        <label>
          Expected status
          <input
            type="number"
            min="100"
            max="599"
            value={form.expected_status}
            onChange={set('expected_status')}
            required
          />
        </label>
        <label>
          Timeout (seconds)
          <input
            type="number"
            min="1"
            max="30"
            value={form.timeout_seconds}
            onChange={set('timeout_seconds')}
            required
          />
        </label>
      </div>

      <div className="row">
        <label>
          Down after failed checks in a row
          <input
            type="number"
            min="1"
            max="10"
            value={form.failure_threshold}
            onChange={set('failure_threshold')}
            required
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.alerts_enabled}
            onChange={(e) => setForm({ ...form, alerts_enabled: e.target.checked })}
          />
          Send email alerts
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save changes' : 'Add monitor'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}