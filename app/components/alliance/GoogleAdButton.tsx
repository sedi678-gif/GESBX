'use client';

export interface GoogleAdButtonProps {
  onClick?: () => void;
  variant?: 'pill' | 'nav' | 'xp' | 'bolt';
  label?: string;
  className?: string;
  disabled?: boolean;
}

export default function GoogleAdButton({ onClick, variant = 'pill', label, className, disabled }: GoogleAdButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={label || 'Kəşf görünürlüğü artır'}
      title={label || 'Videonu Kəşfdə önə çıxar'}
      style={{
        width: variant === 'bolt' ? 42 : undefined,
        height: variant === 'bolt' ? 42 : undefined,
        border: 0,
        borderRadius: variant === 'bolt' ? '50%' : 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: variant === 'bolt' ? 'linear-gradient(135deg,#facc15,#f97316)' : '#f59e0b',
        color: '#111827',
        fontSize: variant === 'bolt' ? 22 : 14,
        fontWeight: 800,
        opacity: disabled ? 0.55 : 1,
        boxShadow: '0 4px 14px rgba(249,115,22,.3)',
      }}
    >
      {variant === 'bolt' ? '⚡' : label || 'Kəşfə çıxar'}
    </button>
  );
}
