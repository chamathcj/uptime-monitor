import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';

function label(iso, range) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '24h') return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export default function ResponseChart({ data, range }) {
  if (data.length === 0) {
    return <p className="muted">No data yet. Results appear here once the monitor has run.</p>;
  }

  const rows = data.map((d) => ({
    label: label(d.bucket, range),
    avg_ms: d.avg_ms,
    failures: d.failures,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#26262f" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#9ca3af" fontSize={12} minTickGap={32} />
        <YAxis yAxisId="ms" stroke="#9ca3af" fontSize={12} unit=" ms" width={70} />
        <YAxis yAxisId="fail" orientation="right" hide allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a22', border: '1px solid #2f2f3a', borderRadius: 8 }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Bar yAxisId="fail" dataKey="failures" name="Failed checks" fill="#ef4444" fillOpacity={0.35} />
        <Line
          yAxisId="ms"
          type="monotone"
          dataKey="avg_ms"
          name="Avg response (ms)"
          stroke="#818cf8"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}