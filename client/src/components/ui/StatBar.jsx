/**
 * StatBar — horizontal progress bar with optional label/value.
 * Supports single-color or segmented (multi-color) display.
 *
 * Single:   <StatBar value={62} max={100} color="accent" label="Win rate" />
 * Segments: <StatBar segments={[
 *             { value: 40, color: '#ef4444' },
 *             { value: 35, color: '#3b82f6' },
 *             { value: 25, color: '#cbd5e1' },
 *           ]} />
 */
const COLOR_CLASS = {
  accent:  'bg-accent',
  win:     'bg-win',
  loss:    'bg-loss',
  warn:    'bg-warn',
  info:    'bg-info',
  neutral: 'bg-txt-muted',
};

const HEIGHT_CLASS = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-2.5',
};

export default function StatBar({
  value,
  max = 100,
  segments,
  color = 'accent',
  height = 'sm',
  label,
  valueLabel,
  className = '',
}) {
  const h = HEIGHT_CLASS[height] || HEIGHT_CLASS.sm;

  return (
    <div className={`w-full ${className}`}>
      {(label || valueLabel != null) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-[10px] text-txt-muted">{label}</span>}
          {valueLabel != null && (
            <span className="text-[10px] text-txt-secondary font-medium tabular-nums">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div className={`${h} bg-surface-elevated rounded-xs overflow-hidden flex`}>
        {segments ? (
          segments.map((s, i) => {
            const pct = (s.value / (segments.reduce((a, b) => a + b.value, 0) || 1)) * 100;
            return (
              <div
                key={i}
                className="h-full transition-all duration-500"
                style={{ width: `${pct}%`, background: s.color }}
              />
            );
          })
        ) : (
          <div
            className={`${COLOR_CLASS[color] || COLOR_CLASS.accent} h-full rounded-xs transition-all duration-500`}
            style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }}
          />
        )}
      </div>
    </div>
  );
}
