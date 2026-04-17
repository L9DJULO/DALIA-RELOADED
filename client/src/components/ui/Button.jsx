import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Button — unified primitive.
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg
 */
const VARIANT_CLASS = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  danger:    'btn-danger',
};

const SIZE_CLASS = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    fullWidth = false,
    className = '',
    children,
    disabled,
    ...props
  },
  ref
) {
  const base = VARIANT_CLASS[variant] || VARIANT_CLASS.primary;
  const sz = SIZE_CLASS[size] || SIZE_CLASS.md;
  // Strip the default size bundled in variant classes by overriding with explicit size util
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${sz} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'lg' ? 15 : 13} className="animate-spin" />
      ) : LeftIcon ? (
        <LeftIcon size={size === 'lg' ? 15 : size === 'sm' ? 11 : 13} />
      ) : null}
      {children}
      {!loading && RightIcon ? (
        <RightIcon size={size === 'lg' ? 15 : size === 'sm' ? 11 : 13} />
      ) : null}
    </button>
  );
});

export default Button;
