import { forwardRef } from 'react';

/**
 * Input — text field primitive with optional left icon and label.
 * Pairs with the .input-field component class.
 */
const Input = forwardRef(function Input(
  {
    label,
    hint,
    error,
    leftIcon: LeftIcon,
    rightSlot,
    className = '',
    containerClassName = '',
    id,
    ...props
  },
  ref
) {
  const inputId = id || props.name;
  return (
    <div className={`space-y-1 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="block text-[11px] font-medium text-txt-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {LeftIcon && (
          <LeftIcon
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input-field ${LeftIcon ? 'pl-8' : ''} ${rightSlot ? 'pr-9' : ''} ${
            error ? '!border-loss focus:!border-loss focus:!shadow-none' : ''
          } ${className}`}
          {...props}
        />
        {rightSlot && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {rightSlot}
          </div>
        )}
      </div>
      {hint && !error && (
        <p className="text-[10px] text-txt-muted">{hint}</p>
      )}
      {error && (
        <p className="text-[10px] text-loss">{error}</p>
      )}
    </div>
  );
});

export default Input;
