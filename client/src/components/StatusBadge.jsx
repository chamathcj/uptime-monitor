const LABELS = {
  up: 'Up',
  down: 'Down',
  pending: 'Pending',
  paused: 'Paused',
  warning: 'Failing',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {LABELS[status] ?? status}
    </span>
  );
}