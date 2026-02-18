/**
 * Skeleton loader — animated placeholder for loading content.
 */
export default function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-800 ${className}`}
      style={{ width, height }}
      role="status"
      aria-label="Chargement…"
    />
  );
}
