/**
 * Skeleton loader — animated shimmer placeholder.
 */
export default function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`skeleton-shimmer rounded-lg ${className}`}
      style={{ width, height }}
      role="status"
      aria-label="Chargement..."
    />
  );
}
