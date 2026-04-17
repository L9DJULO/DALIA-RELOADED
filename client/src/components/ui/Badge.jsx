/**
 * Badge — small label with semantic color variant.
 * Flat + hairline border, aligned with Arena design system.
 */
const VARIANTS = {
  neutral: 'bg-surface-elevated text-txt-secondary border-border',
  accent:  'bg-accent-muted text-violet-300 border-border-accent',
  win:     'bg-win-bg text-win border-win-border',
  loss:    'bg-loss-bg text-loss border-loss-border',
  warn:    'bg-warn-bg text-warn border-warn-border',
  info:    'bg-info-bg text-info border-info-border',
  // Legacy aliases (kept for backward compat with existing usages)
  default: 'bg-surface-elevated text-txt-secondary border-border',
  success: 'bg-win-bg text-win border-win-border',
  warning: 'bg-warn-bg text-warn border-warn-border',
  danger:  'bg-loss-bg text-loss border-loss-border',
  purple:  'bg-accent-muted text-violet-300 border-border-accent',
};

const SIZES = {
  xs: 'px-1 py-px text-[9px]',
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-[11px]',
};

export default function Badge({ children, variant = 'neutral', size = 'sm', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xs border font-medium leading-none
                  ${SIZES[size] || SIZES.sm} ${VARIANTS[variant] || VARIANTS.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
