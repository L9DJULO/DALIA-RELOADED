import { getScoreClasses } from '../../lib/scores';

/**
 * ScorePill — chiffre + couleur selon seuil (0..100).
 * Sizes: sm (28px) | md (36px) | lg (44px)
 */
const SIZES = {
  sm: { box: 'w-7 h-7 text-[11px]',  sub: 'text-[8px]' },
  md: { box: 'w-9 h-9 text-xs',      sub: 'text-[9px]' },
  lg: { box: 'w-11 h-11 text-sm',    sub: 'text-[9px]' },
};

export default function ScorePill({ value, scoreRange, size = 'md', className = '' }) {
  const colors = getScoreClasses(value);
  const sz = SIZES[size] || SIZES.md;
  const hasRange = scoreRange && scoreRange.length === 2;
  const halfWidth = hasRange ? Math.round((scoreRange[1] - scoreRange[0]) / 2) : 0;

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <div
        className={`${sz.box} rounded-sm ${colors.bg} border ${colors.border}
                    flex items-center justify-center font-display font-bold tabular-nums ${colors.text}`}
      >
        {Math.round(value)}
      </div>
      {hasRange && halfWidth > 0 && (
        <span
          className={`${sz.sub} text-txt-muted tabular-nums`}
          title={`Fourchette ${scoreRange[0].toFixed(0)}–${scoreRange[1].toFixed(0)}`}
        >
          ±{halfWidth}
        </span>
      )}
    </div>
  );
}
