interface CardCreatorStatusHeaderProps {
  disabled: boolean;
  saving: boolean;
  statusLabel: string;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

export function CardCreatorStatusHeader({
  disabled,
  saving,
  statusLabel,
  onSaveDraft,
  onSubmit,
}: CardCreatorStatusHeaderProps) {
  return (
    <div className="creator-status-header">
      <div className="creator-status-header__copy">
        <strong className="creator-status-header__title">Редактор карточки</strong>
        <div className="creator-status-header__status">
          <span className="creator-status-header__label">Текущий статус</span>
          <span className="creator-status-header__value">{statusLabel}</span>
        </div>
      </div>

      <div className="creator-status-header__actions">
        <button
          className="action-button action-button--outline-light"
          disabled={saving || disabled}
          onClick={onSaveDraft}
          type="button"
        >
          Сохранить как черновик
        </button>
        <button
          className="action-button action-button--solid creator-status-header__submit"
          disabled={saving || disabled}
          onClick={onSubmit}
          type="button"
        >
          Отправить на модерацию
        </button>
      </div>
    </div>
  );
}
