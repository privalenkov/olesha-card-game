import { RELEASE_NOTES } from '../releaseNotes';
import { InfoModal } from './InfoModal';

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export function ReleaseNotesModal({ onClose }: ReleaseNotesModalProps) {
  return (
    <InfoModal
      actionLabel={RELEASE_NOTES.actionLabel}
      backgroundColor={RELEASE_NOTES.backgroundColor}
      onClose={onClose}
      sections={RELEASE_NOTES.sections}
      title={RELEASE_NOTES.title}
    />
  );
}
