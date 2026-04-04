import type { ComponentPropsWithoutRef } from 'react';
import { useDebouncedTextControl } from './useDebouncedTextControl';

interface TextAreaProps
  extends Omit<ComponentPropsWithoutRef<'textarea'>, 'defaultValue' | 'onChange' | 'value'> {
  className?: string;
  debounceMs?: number;
  defaultValue?: string;
  onChange?: ComponentPropsWithoutRef<'textarea'>['onChange'];
  onValueChange?: (value: string) => void;
  value?: string;
}

export function TextArea({
  className,
  debounceMs = 400,
  defaultValue,
  onBlur,
  onChange,
  onValueChange,
  value,
  ...props
}: TextAreaProps) {
  const classes = ['ui-text-area', className].filter(Boolean).join(' ');

  const debouncedControl = useDebouncedTextControl<HTMLTextAreaElement>({
    debounceMs,
    defaultValue,
    onBlur,
    onChange,
    onValueChange,
    value,
  });

  if (!onValueChange) {
    return (
      <textarea
        {...props}
        className={classes}
        defaultValue={defaultValue}
        onBlur={onBlur}
        onChange={onChange}
        value={value}
      />
    );
  }

  return (
    <textarea
      {...props}
      className={classes}
      onBlur={debouncedControl.onBlur}
      onChange={debouncedControl.onChange}
      value={debouncedControl.value}
    />
  );
}
