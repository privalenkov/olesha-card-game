import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
} from 'react';

interface FileUploadProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'type' | 'value'> {
  addLabel?: string;
  changeLabel?: string;
  className?: string;
  emptyLabel?: string;
  fileName?: string | null;
  onClear?: () => void;
  onFileSelect?: (file: File | null) => void;
  previewUrl?: string | null;
  removeLabel?: string;
}

export function FileUpload({
  accept,
  addLabel = 'Добавить изображение',
  changeLabel = 'Изменить изображение',
  className,
  disabled = false,
  emptyLabel = 'Файл не выбран',
  fileName,
  onClear,
  onFileSelect,
  previewUrl,
  removeLabel = 'Удалить',
  ...props
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const hasFile = Boolean(fileName);
  const classes = ['ui-file-upload', disabled ? 'ui-file-upload--disabled' : '', className]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    setPreviewBroken(false);
  }, [previewUrl]);

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function openPicker() {
    if (disabled) {
      return;
    }

    inputRef.current?.click();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    onFileSelect?.(file);
    resetInput();
  }

  function handleClear() {
    if (disabled) {
      return;
    }

    onClear?.();
    resetInput();
  }

  return (
    <div className={classes}>
      <span aria-hidden="true" className="ui-file-upload__preview">
        {previewUrl && !previewBroken ? (
          <img
            alt=""
            className="ui-file-upload__preview-image"
            onError={() => setPreviewBroken(true)}
            src={previewUrl}
          />
        ) : null}
      </span>

      <span className="ui-file-upload__name" title={fileName ?? emptyLabel}>
        {fileName ?? emptyLabel}
      </span>

      <div className="ui-file-upload__actions">
        <button
          className="ui-file-upload__button"
          disabled={disabled}
          onClick={openPicker}
          type="button"
        >
          {hasFile ? changeLabel : addLabel}
        </button>

        {hasFile && onClear ? (
          <button
            className="ui-file-upload__button ui-file-upload__button--danger"
            disabled={disabled}
            onClick={handleClear}
            type="button"
          >
            {removeLabel}
          </button>
        ) : null}
      </div>

      <input
        {...props}
        accept={accept}
        className="ui-file-upload__input"
        disabled={disabled}
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
