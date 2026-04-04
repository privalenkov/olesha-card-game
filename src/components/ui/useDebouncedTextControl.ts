import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEventHandler,
  type FocusEventHandler,
} from 'react';

interface DebouncedTextControlOptions<Element extends HTMLInputElement | HTMLTextAreaElement> {
  defaultValue?: string;
  debounceMs: number;
  onBlur?: FocusEventHandler<Element>;
  onChange?: ChangeEventHandler<Element>;
  onValueChange?: (value: string) => void;
  value?: string;
}

export function useDebouncedTextControl<Element extends HTMLInputElement | HTMLTextAreaElement>({
  defaultValue,
  debounceMs,
  onBlur,
  onChange,
  onValueChange,
  value,
}: DebouncedTextControlOptions<Element>) {
  const isControlled = value !== undefined;
  const initialValue = isControlled ? value ?? '' : defaultValue ?? '';
  const [localValue, setLocalValue] = useState(initialValue);
  const pendingValueRef = useRef(initialValue);
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const emitValueChange = useEffectEvent((nextValue: string) => {
    onValueChange?.(nextValue);
  });

  function clearPendingTimer() {
    if (timeoutRef.current === null) {
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  useEffect(() => {
    if (!isControlled) {
      return;
    }

    const nextValue = value ?? '';
    clearPendingTimer();
    pendingValueRef.current = nextValue;
    setLocalValue(nextValue);
  }, [isControlled, value]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, []);

  const handleChange: ChangeEventHandler<Element> = (event) => {
    const nextValue = event.target.value;

    setLocalValue(nextValue);
    pendingValueRef.current = nextValue;
    onChange?.(event);

    if (!onValueChange) {
      return;
    }

    clearPendingTimer();

    if (debounceMs <= 0) {
      emitValueChange(nextValue);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      emitValueChange(pendingValueRef.current);
    }, debounceMs);
  };

  const handleBlur: FocusEventHandler<Element> = (event) => {
    const nextValue = pendingValueRef.current;
    const hasPendingCommit = timeoutRef.current !== null;

    clearPendingTimer();

    if (hasPendingCommit) {
      emitValueChange(nextValue);
    }

    onBlur?.(event);
  };

  return {
    onBlur: handleBlur,
    onChange: handleChange,
    value: localValue,
  };
}
