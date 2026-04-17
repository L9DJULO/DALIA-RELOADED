/**
 * Card — content container.
 * Variants: flat (default) | hover | highlight | glass | elevated
 * Compose with Card.Header / Card.Body / Card.Footer.
 */
const VARIANT_CLASS = {
  flat:      'card',
  hover:     'card card-hover',
  highlight: 'card card-highlight',
  glass:     'glass-card',
  elevated:  'glass-panel',
};

export default function Card({
  variant = 'flat',
  className = '',
  children,
  as: Tag = 'div',
  ...props
}) {
  return (
    <Tag
      className={`${VARIANT_CLASS[variant] || VARIANT_CLASS.flat} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

Card.Header = function CardHeader({ className = '', children, ...props }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 border-b border-border-subtle ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Body = function CardBody({ className = '', children, ...props }) {
  return (
    <div className={`p-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

Card.Footer = function CardFooter({ className = '', children, ...props }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border-t border-border-subtle ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
