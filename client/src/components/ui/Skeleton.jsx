/**
 * Skeleton loader — animated placeholder for loading content.
 */
export default function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ width, height, background: 'var(--surface-elevated)' }}
      role="status"
      aria-label="Chargement…"
    />
  );
}
