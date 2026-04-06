import { useEffect, useId, useRef, useState } from 'react';
import selectArrowIcon from '../../assets/icons/select-arrow.svg';

export interface SelectOption<Value extends string = string> {
  label: string;
  value: Value;
}

interface SelectProps<Value extends string = string> {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
  options: readonly SelectOption<Value>[];
  placeholder?: string;
  value?: Value;
}

export function Select<Value extends string = string>({
  ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  placeholder,
  value,
}: SelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const triggerDisabled = disabled || options.length === 0;
  const classes = ['ui-select', open ? 'ui-select--open' : '', className].filter(Boolean).join(' ');

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (triggerDisabled) {
      setOpen(false);
    }
  }, [triggerDisabled]);

  return (
    <div className={classes} ref={rootRef}>
      <button
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="ui-select__trigger"
        disabled={triggerDisabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          className={`ui-select__value ${selectedOption ? '' : 'ui-select__value--placeholder'}`.trim()}
        >
          {selectedOption?.label ?? placeholder ?? ''}
        </span>
        <img
          alt=""
          aria-hidden="true"
          className="ui-select__icon"
          height="8"
          src={selectArrowIcon}
          width="13"
        />
      </button>

      <div
        aria-hidden={!open}
        className={`ui-select__menu-shell ${open ? 'ui-select__menu-shell--open' : ''}`.trim()}
      >
        <div className="ui-select__menu" id={listboxId} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="ui-select__option"
              key={option.value}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
              role="option"
              tabIndex={open ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
