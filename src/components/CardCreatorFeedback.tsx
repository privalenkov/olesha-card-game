interface CardCreatorFeedbackProps {
  rejectionReason?: string | null;
  statusMessage?: string | null;
}

export function CardCreatorFeedback({
  rejectionReason,
  statusMessage,
}: CardCreatorFeedbackProps) {
  if (!rejectionReason && !statusMessage) {
    return null;
  }

  return (
    <div className="creator-feedback">
      {rejectionReason ? <span>Причина отказа: {rejectionReason}</span> : null}
      {statusMessage ? <span>{statusMessage}</span> : null}
    </div>
  );
}
