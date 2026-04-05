import { useId, type ComponentPropsWithoutRef } from 'react';

interface RangeInputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'type'> {
  className?: string;
  label: string;
  onValueChange: (value: number) => void;
  value: number;
  valueLabel: string;
}

export function RangeInput({
  className,
  disabled = false,
  label,
  onValueChange,
  value,
  valueLabel,
  ...props
}: RangeInputProps) {
  const inputId = useId();
  const classes = ['ui-range-input', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <label className="ui-range-input__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...props}
        className="ui-range-input__control"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onValueChange(Number(event.target.value))}
        type="range"
        value={value}
      />
      <span className="ui-range-input__value">{valueLabel}</span>
    </div>
  );
}
