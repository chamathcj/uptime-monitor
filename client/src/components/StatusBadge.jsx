const LABELS = { up: 'Up', down: 'Down', pending: 'Pending', paused: 'Paused' };

export default function StatusBadge({ status, paused }) {
  const key = paused ? 'paused' : status;
  return (
    <span className={`badge badge-${key}`}>
      <span className="dot" />
      {LABELS[key]}
    </span>
  );
}