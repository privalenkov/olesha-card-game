import type { ComponentPropsWithoutRef } from 'react';
import { useDebouncedTextControl } from './useDebouncedTextControl';

interface TextInputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'defaultValue' | 'onChange' | 'value'> {
  className?: string;
  debounceMs?: number;
  defaultValue?: string;
  onChange?: ComponentPropsWithoutRef<'input'>['onChange'];
  onValueChange?: (value: string) => void;
  value?: string;
}

export function TextInput({
  className,
  debounceMs = 400,
  defaultValue,
  onBlur,
  onChange,
  onValueChange,
  type = 'text',
  value,
  ...props
}: TextInputProps) {
  const classes = ['ui-text-input', className].filter(Boolean).join(' ');

  const debouncedControl = useDebouncedTextControl<HTMLInputElement>({
    debounceMs,
    defaultValue,
    onBlur,
    onChange,
    onValueChange,
    value,
  });

  if (!onValueChange) {
    return (
      <input
        {...props}
        className={classes}
        defaultValue={defaultValue}
        onBlur={onBlur}
        onChange={onChange}
        type={type}
        value={value}
      />
    );
  }

  return (
    <input
      {...props}
      className={classes}
      onBlur={debouncedControl.onBlur}
      onChange={debouncedControl.onChange}
      type={type}
      value={debouncedControl.value}
    />
  );
}
