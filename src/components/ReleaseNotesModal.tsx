import { useEffect } from 'react';
import { RELEASE_NOTES } from '../releaseNotes';

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export function ReleaseNotesModal({ onClose }: ReleaseNotesModalProps) {
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
      className="release-notes-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="release-notes-title"
        aria-modal="true"
        className="release-notes-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="release-notes-dialog__eyebrow">{RELEASE_NOTES.versionLabel}</div>
        <div className="release-notes-dialog__head">
          <strong id="release-notes-title">{RELEASE_NOTES.title}</strong>
          <p>{RELEASE_NOTES.summary}</p>
        </div>

        <ul className="release-notes-dialog__list">
          {RELEASE_NOTES.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="release-notes-dialog__actions">
          <button className="action-button" onClick={onClose} type="button">
            Понятно
          </button>
        </div>
      </section>
    </div>
  );
}
