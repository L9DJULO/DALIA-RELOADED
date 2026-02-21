/**
 * Badge / Tag primitive — small label with color variant.
 * Premium glass-style badges.
 */
const VARIANTS = {
  default: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  accent: 'bg-violet-500/12 text-violet-400 border-violet-500/20',
  success: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/12 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/12 text-red-400 border-red-500/20',
  info: 'bg-sky-500/12 text-sky-400 border-sky-500/20',
  purple: 'bg-purple-500/12 text-purple-400 border-purple-500/20',
};

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-none backdrop-blur-sm ${VARIANTS[variant] || VARIANTS.default} ${className}`}
    >
      {children}
    </span>
  );
}
