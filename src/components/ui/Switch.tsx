import type { ButtonHTMLAttributes } from 'react';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  label?: string;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({
  checked,
  className,
  disabled = false,
  label,
  onCheckedChange,
  type = 'button',
  ...props
}: SwitchProps) {
  const rowClasses = ['ui-switch-row', className].filter(Boolean).join(' ');
  const switchClasses = ['ui-switch', checked ? 'ui-switch--checked' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClasses}>
      {label ? <span className="ui-switch-row__label">{label}</span> : null}
      <button
        {...props}
        aria-checked={checked}
        className={switchClasses}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type={type}
      >
        <span className="ui-switch__thumb" />
      </button>
    </div>
  );
}
