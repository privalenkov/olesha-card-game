import { type CSSProperties, type ReactNode, useEffect, useId } from 'react';

export interface InfoModalSection {
  key?: string;
  text: ReactNode;
  title: ReactNode;
}

interface InfoModalProps {
  actionLabel?: string;
  ariaLabel?: string;
  backgroundColor?: string;
  children?: ReactNode;
  maxHeight?: number | string;
  maxWidth?: number | string;
  onAction?: () => void;
  onClose: () => void;
  sections?: readonly InfoModalSection[];
  title?: ReactNode;
}

function formatDimension(value: number | string | undefined) {
  if (typeof value === 'number') {
    return `${value}px`;
  }

  return value;
}

export function InfoModal({
  actionLabel = 'Понятно',
  ariaLabel = 'Информационное окно',
  backgroundColor = '#0D0E17',
  children,
  maxHeight = 424,
  maxWidth = 424,
  onAction,
  onClose,
  sections,
  title,
}: InfoModalProps) {
  const titleId = useId();
  const hasTitle = Boolean(title);
  const dialogStyle: CSSProperties = {
    backgroundColor,
    ['--info-modal-max-height' as string]: formatDimension(maxHeight),
    ['--info-modal-max-width' as string]: formatDimension(maxWidth),
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="collection-overlay collection-overlay--collection info-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-label={hasTitle ? undefined : ariaLabel}
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-modal="true"
        className="info-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        style={dialogStyle}
      >
        {hasTitle ? (
          <h2 className="info-modal__title" id={titleId}>
            {title}
          </h2>
        ) : null}

        {sections?.length || children ? (
          <div className="info-modal__body">
            {sections?.length ? (
              <div className="info-modal__sections">
                {sections.map((section, index) => (
                  <section
                    className="info-modal__section"
                    key={section.key ?? `info-modal-section-${index}`}
                  >
                    <h3 className="info-modal__section-title">{section.title}</h3>
                    <div className="info-modal__section-text">{section.text}</div>
                  </section>
                ))}
              </div>
            ) : children ? (
              <div className="info-modal__content">{children}</div>
            ) : null}
          </div>
        ) : null}

        <div className="info-modal__actions">
          <button className="action-button action-button--solid" onClick={onAction ?? onClose} type="button">
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
