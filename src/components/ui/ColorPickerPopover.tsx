import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import ColorPicker from 'react-best-gradient-color-picker';

type BaseColorPickerProps = Omit<
  ComponentProps<typeof ColorPicker>,
  'className' | 'onChange' | 'value'
>;

interface ColorPickerPopoverProps extends BaseColorPickerProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

interface PopoverPosition {
  left: number;
  top: number;
}

const VIEWPORT_PADDING = 16;

export function ColorPickerPopover({
  disabled = false,
  onChange,
  value,
  ...pickerProps
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (
        target &&
        (triggerRef.current?.contains(target) || popoverRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      setOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) {
      return;
    }

    const rect = popoverRef.current.getBoundingClientRect();
    const minLeft = window.scrollX + VIEWPORT_PADDING;
    const minTop = window.scrollY + VIEWPORT_PADDING;
    const maxLeft = window.scrollX + window.innerWidth - rect.width - VIEWPORT_PADDING;
    const maxTop = window.scrollY + window.innerHeight - rect.height - VIEWPORT_PADDING;
    const nextLeft = Math.max(minLeft, Math.min(position.left, maxLeft));
    const nextTop = Math.max(minTop, Math.min(position.top, maxTop));

    if (nextLeft !== position.left || nextTop !== position.top) {
      setPosition({ left: nextLeft, top: nextTop });
    }
  }, [open, position.left, position.top]);

  function handleTriggerClick(event: MouseEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    const nextPosition = {
      left: window.scrollX + event.clientX + 12,
      top: window.scrollY + event.clientY + 12,
    };

    setPosition(nextPosition);
    setOpen((current) => !current);
  }

  const pickerPopover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="ui-color-picker__popover"
            ref={popoverRef}
            style={{ left: position.left, top: position.top }}
          >
            <div className="ui-color-picker__panel">
              <ColorPicker
                {...pickerProps}
                className="ui-color-picker__picker"
                onChange={onChange}
                value={value}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        aria-expanded={open}
        className="ui-color-picker__swatch"
        disabled={disabled}
        onClick={handleTriggerClick}
        ref={triggerRef}
        style={{ background: value || '#080910' }}
        type="button"
      />
      {pickerPopover}
    </>
  );
}
