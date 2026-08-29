import type { Status } from '../types';

interface Props {
  status?: Status | null;
  text?: string;
  color?: string;
}

export default function StatusBadge({ status, text, color }: Props) {
  const displayText = text || status?.name || '—';
  const displayColor = color || status?.color || '#6b7280';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: displayColor }}
    >
      {displayText}
    </span>
  );
}