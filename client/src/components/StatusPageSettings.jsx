import { useEffect, useState } from 'react';
import { api } from '../api';

export default function StatusPageSettings({ onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({ slug: '', title: '', description: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/status-page')
      .then((page) => {
        if (page) {
          setSaved(page);
          setForm({
            slug: page.slug,
            title: page.title,
            description: page.description ?? '',
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const page = await api('/status-page', { method: 'PUT', body: form });
      setSaved(page);
      setMessage('Saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="muted">Loading...</p>;

  const link = saved ? `${window.location.origin}/status/${saved.slug}` : null;

  return (
    <form onSubmit={handleSubmit}>
      <h2>Public status page</h2>
      <p className="muted small">
        Choose which monitors appear on it with the "Show on public status page"
        option when you add or edit a monitor. URLs and error details are never shown.
      </p>

      <div className="row">
        <label>
          Address
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({
                ...form,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
              })
            }
            placeholder="my-project"
            minLength={3}
            maxLength={40}
            required
          />
        </label>
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="My Project Status"
            maxLength={100}
            required
          />
        </label>
      </div>

      <label>
        Description (optional)
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={300}
        />
      </label>

      {error && <p className="error">{error}</p>}
      {message && <p className="positive small">{message}</p>}
      {link && (
        <p className="small">
          Your page:{' '}
          <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
        </p>
      )}

      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}