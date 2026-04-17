/**
 * Tooltip — CSS-only hover tooltip.
 * Wraps any trigger. Content appears above by default.
 *
 * Usage:
 *   <Tooltip content="Hello">
 *     <button>Hover me</button>
 *   </Tooltip>
 */
const POSITIONS = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

export default function Tooltip({
  children,
  content,
  position = 'top',
  className = '',
  maxWidth = 220,
}) {
  if (!content) return children;
  return (
    <span className="relative inline-flex group/tooltip">
      {children}
      <span
        role="tooltip"
        style={{ maxWidth }}
        className={`pointer-events-none absolute ${POSITIONS[position]} z-50
                    px-2.5 py-1.5 rounded-sm
                    bg-surface-overlay border border-border
                    text-[10px] leading-relaxed text-txt-primary
                    shadow-lg whitespace-normal
                    opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
                    transition-opacity duration-150 ${className}`}
      >
        {content}
      </span>
    </span>
  );
}
