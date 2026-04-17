/**
 * Tabs — segmented control.
 * Usage:
 *   <Tabs value={x} onChange={setX} items={[{ id, label, icon, badge }]} variant="accent" />
 */
export default function Tabs({
  items = [],
  value,
  onChange,
  variant = 'neutral',
  size = 'md',
  fullWidth = true,
  className = '',
}) {
  const sizePad = size === 'sm' ? 'py-1 px-2 text-[11px]' : 'py-1.5 px-3 text-xs';

  return (
    <div role="tablist" className={`tab-bar ${className}`}>
      {items.map(({ id, label, icon: Icon, badge, disabled }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(id)}
            data-variant={variant}
            className={`tab-btn ${sizePad} relative ${fullWidth ? 'flex-1' : 'flex-initial'}`}
          >
            {Icon && <Icon size={13} />}
            <span>{label}</span>
            {badge && !selected && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-accent ring-2 ring-surface-default" />
            )}
          </button>
        );
      })}
    </div>
  );
}
