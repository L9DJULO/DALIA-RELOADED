/**
 * Badge/Tag primitive — small label with color variant.
 */
const VARIANTS = {
  default: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
  accent: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  danger: 'bg-red-500/15 text-red-400 border-red-500/25',
  info: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
};

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-none ${VARIANTS[variant] || VARIANTS.default} ${className}`}
    >
      {children}
    </span>
  );
}
