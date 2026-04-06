import { useEffect, useMemo, useState } from 'react';
import { CardViewerCanvas } from '../components/CardViewerCanvas';
import { TextArea } from '../components/ui/TextArea';
import { rarityMeta } from '../game/config';
import {
  approveProposal,
  deleteAdminCard,
  deleteProposal,
  fetchAdminCatalog,
  fetchAdminProposals,
  fetchAdminUsers,
  unlockAdminUserPack,
} from '../game/api';
import {
  buildPreviewCardFromDefinition,
  buildPreviewOwnedCard,
} from '../game/cardDraft';
import { useGame } from '../game/GameContext';
import type {
  AdminCatalogCard,
  AdminUserRecord,
  CardProposal,
  OwnedCard,
  RarityBalanceSnapshot,
} from '../game/types';
import { rarityOrder } from '../game/types';
import { useCardPreviewImage } from '../three/textures';

type AdminTab = 'proposals' | 'cards' | 'users';

function ProposalRow({
  proposal,
  busy,
  onOpen,
  onApprove,
  onDelete,
}: {
  proposal: CardProposal;
  busy: boolean;
  onOpen: (card: OwnedCard) => void;
  onApprove: () => void;
  onDelete: () => void;
}) {
  const previewCard = useMemo(() => buildPreviewOwnedCard(proposal), [proposal]);
  const previewImage = useCardPreviewImage(previewCard);

  return (
    <article className="proposal-card">
      <img
        alt={proposal.title}
        className="proposal-card__image"
        onClick={() => onOpen(previewCard)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(previewCard);
          }
        }}
        role="button"
        src={previewImage}
        tabIndex={0}
      />
      <div className="proposal-card__body">
        <strong>{proposal.title}</strong>
        <span>
          {proposal.creatorName} • {proposal.rarity}
        </span>
        <p>{proposal.description}</p>
        <div className="proposal-card__actions">
          <button
            className="action-button action-button--solid"
            disabled={busy}
            onClick={onApprove}
            type="button"
          >
            Принять
          </button>
          <button className="action-button" disabled={busy} onClick={onDelete} type="button">
            Отклонить
          </button>
        </div>
      </div>
    </article>
  );
}

function AdminCatalogRow({
  item,
  busy,
  onOpen,
  onDelete,
}: {
  item: AdminCatalogCard;
  busy: boolean;
  onOpen: (card: OwnedCard) => void;
  onDelete: () => void;
}) {
  const previewCard = useMemo(() => buildPreviewCardFromDefinition(item.card), [item.card]);
  const previewImage = useCardPreviewImage(previewCard);

  return (
    <article className="proposal-card">
      <img
        alt={item.card.title}
        className="proposal-card__image"
        onClick={() => onOpen(previewCard)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(previewCard);
          }
        }}
        role="button"
        src={previewImage}
        tabIndex={0}
      />
      <div className="proposal-card__body">
        <strong>{item.card.title}</strong>
        <span>
          {item.card.creatorName ?? 'без автора'} • {item.card.rarity}
        </span>
        <p>{item.card.description}</p>
        <div className="admin-metrics">
          <span>Всего копий: {item.totalOwned}</span>
          <span>Владельцев: {item.uniqueOwners}</span>
          <span>Шанс в паке: {(item.dropChancePerPack * 100).toFixed(2)}%</span>
          <span>ID: {item.card.id}</span>
        </div>
        <div className="proposal-card__actions">
          <button className="action-button" disabled={busy} onClick={onDelete} type="button">
            {busy ? 'Удаляем...' : 'Удалить у всех'}
          </button>
        </div>
      </div>
    </article>
  );
}

function AdminUserRow({
  user,
  busy,
  onUnlock,
}: {
  user: AdminUserRecord;
  busy: boolean;
  onUnlock: () => void;
}) {
  return (
    <article className="admin-user-card">
      <div className="admin-user-card__head">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
      </div>
      <div className="admin-user-card__grid">
        <span>ID: {user.id}</span>
        <span>Google sub: {user.googleSub}</span>
        <span>Всего карточек: {user.totalCards}</span>
        <span>Уникальных: {user.uniqueCards}</span>
        <span>Открыто паков: {user.packsOpened}</span>
        <span>
          Сегодня открыто: {user.packsOpenedToday} / {user.dailyPackLimit}
        </span>
        <span>Разблокировок на сегодня: {user.extraPacksGrantedToday}</span>
        <span>Можно открыть сейчас: {user.remainingPacksToday}</span>
        <span>Обновлен: {new Date(user.updatedAt).toLocaleString()}</span>
      </div>
      <div className="admin-user-card__actions">
        <button
          className="action-button action-button--solid"
          disabled={busy}
          onClick={onUnlock}
          type="button"
        >
          {busy ? 'Разблокируем...' : 'Разблокировать пак'}
        </button>
      </div>
    </article>
  );
}

export function AdminProposalsPage() {
  const { isAdmin } = useGame();
  const [tab, setTab] = useState<AdminTab>('proposals');
  const [activeCard, setActiveCard] = useState<OwnedCard | null>(null);
  const [proposals, setProposals] = useState<CardProposal[]>([]);
  const [cards, setCards] = useState<AdminCatalogCard[]>([]);
  const [rarityBalance, setRarityBalance] = useState<RarityBalanceSnapshot | null>(null);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingProposal, setRejectingProposal] = useState<CardProposal | null>(null);
  const [deletingCard, setDeletingCard] = useState<AdminCatalogCard | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const rarityBreakdown = useMemo(() => {
    return rarityOrder.map((rarity) => {
      const items = cards.filter((item) => item.card.rarity === rarity);
      const balanceEntry = rarityBalance?.entries.find((entry) => entry.rarity === rarity);

      return {
        rarity,
        count: balanceEntry?.catalogCount ?? items.length,
        share: balanceEntry?.catalogShare ?? 0,
        targetShare: balanceEntry?.targetCatalogShare ?? 0,
        proposalChance: balanceEntry?.proposalChance ?? 0,
        perCardDropChance: items[0]?.dropChancePerPack ?? 0,
      };
    });
  }, [cards, rarityBalance]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [proposalResponse, cardsResponse, usersResponse] = await Promise.all([
          fetchAdminProposals(),
          fetchAdminCatalog(),
          fetchAdminUsers(),
        ]);

        if (cancelled) {
          return;
        }

        setProposals(proposalResponse.proposals);
        setCards(cardsResponse.cards);
        setRarityBalance(cardsResponse.rarityBalance);
        setUsers(usersResponse.users);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить админку.');
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveCard(null);
        setRejectingProposal(null);
        setDeletingCard(null);
        setRejectionReason('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function confirmRejection() {
    if (!rejectingProposal) {
      return;
    }

    const reason = rejectionReason.trim();

    if (reason.length < 6 || reason.length > 280) {
      setError('Причина отказа должна быть длиной от 6 до 280 символов.');
      return;
    }

    setBusyId(rejectingProposal.id);

    try {
      await deleteProposal(rejectingProposal.id, reason);
      setProposals((current) => current.filter((item) => item.id !== rejectingProposal.id));
      setRejectingProposal(null);
      setRejectionReason('');
      setError(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Не удалось отклонить предложение.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCardDeletion() {
    if (!deletingCard) {
      return;
    }

    const busyKey = `delete-card:${deletingCard.card.id}`;
    setBusyId(busyKey);

    try {
      await deleteAdminCard(deletingCard.card.id);

      const [cardsResponse, usersResponse] = await Promise.all([
        fetchAdminCatalog(),
        fetchAdminUsers(),
      ]);

      setCards(cardsResponse.cards);
      setRarityBalance(cardsResponse.rarityBalance);
      setUsers(usersResponse.users);
      setActiveCard((current) => (current?.id === deletingCard.card.id ? null : current));
      setDeletingCard(null);
      setError(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Не удалось удалить карточку из игры.',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <section className="page page--admin">
        <div className="creator-empty empty-state">
          <strong>Доступ только для администратора</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="page page--admin">
      <div className="admin-header">
        <div>
          <strong>Админка</strong>
          {error ? <span>{error}</span> : null}
        </div>

        <div className="collection-breakdown collection-breakdown--minimal admin-breakdown">
          <div>
            <strong>{proposals.length}</strong>
            <span>На модерации</span>
          </div>
          <div>
            <strong>{cards.length}</strong>
            <span>Карточек в игре</span>
          </div>
          <div>
            <strong>{users.length}</strong>
            <span>Пользователей</span>
          </div>
        </div>
      </div>

      <div className="filter-pills admin-tabs" role="tablist" aria-label="Разделы админки">
        <button
          className={`filter-pill ${tab === 'proposals' ? 'filter-pill--active' : ''}`}
          onClick={() => setTab('proposals')}
          type="button"
        >
          Предложения
        </button>
        <button
          className={`filter-pill ${tab === 'cards' ? 'filter-pill--active' : ''}`}
          onClick={() => setTab('cards')}
          type="button"
        >
          Карточки
        </button>
        <button
          className={`filter-pill ${tab === 'users' ? 'filter-pill--active' : ''}`}
          onClick={() => setTab('users')}
          type="button"
        >
          Пользователи
        </button>
      </div>

      {tab === 'proposals' ? (
        <div className="admin-grid">
          {proposals.length > 0 ? (
            proposals.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                busy={busyId === proposal.id}
                onOpen={setActiveCard}
                onApprove={async () => {
                  setBusyId(proposal.id);

                  try {
                    await approveProposal(proposal.id);
                    setProposals((current) => current.filter((item) => item.id !== proposal.id));
                    const cardsResponse = await fetchAdminCatalog();
                    setCards(cardsResponse.cards);
                    setRarityBalance(cardsResponse.rarityBalance);
                    setError(null);
                  } catch (approveError) {
                    setError(
                      approveError instanceof Error ? approveError.message : 'Не удалось принять карточку.',
                    );
                  } finally {
                    setBusyId(null);
                  }
                }}
                onDelete={async () => {
                  setRejectingProposal(proposal);
                  setRejectionReason('');
                  setError(null);
                }}
                proposal={proposal}
              />
            ))
          ) : (
            <div className="creator-empty empty-state">
              <strong>Предложений на модерации нет</strong>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'cards' ? (
        <>
          {cards.length > 0 ? (
            <>
              <div className="admin-rarity-summary">
                {rarityBreakdown.map((item) => (
                  <article key={item.rarity} className="admin-rarity-card">
                    <strong>{rarityMeta[item.rarity].label}</strong>
                    <span>Карточек: {item.count}</span>
                    <span>Доля каталога: {(item.share * 100).toFixed(1)}%</span>
                    <span>Цель каталога: {(item.targetShare * 100).toFixed(1)}%</span>
                    <span>Шанс выдачи в редакторе: {(item.proposalChance * 100).toFixed(1)}%</span>
                    <span>Шанс конкретной карточки: {(item.perCardDropChance * 100).toFixed(2)}%</span>
                  </article>
                ))}
              </div>

              <div className="admin-grid">
                {cards.map((item) => (
                  <AdminCatalogRow
                    key={item.card.id}
                    busy={busyId === `delete-card:${item.card.id}`}
                    item={item}
                    onDelete={() => {
                      setDeletingCard(item);
                      setError(null);
                    }}
                    onOpen={setActiveCard}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="creator-empty empty-state">
              <strong>Принятых карточек пока нет</strong>
            </div>
          )}
        </>
      ) : null}

      {tab === 'users' ? (
        <div className="admin-users">
          {users.length > 0 ? (
            users.map((user) => (
              <AdminUserRow
                key={user.id}
                busy={busyId === `unlock-pack:${user.id}`}
                onUnlock={async () => {
                  setBusyId(`unlock-pack:${user.id}`);

                  try {
                    await unlockAdminUserPack(user.id);
                    const usersResponse = await fetchAdminUsers();
                    setUsers(usersResponse.users);
                    setError(null);
                  } catch (unlockError) {
                    setError(
                      unlockError instanceof Error
                        ? unlockError.message
                        : 'Не удалось разблокировать пак пользователю.',
                    );
                  } finally {
                    setBusyId(null);
                  }
                }}
                user={user}
              />
            ))
          ) : (
            <div className="creator-empty empty-state">
              <strong>Пользователей пока нет</strong>
            </div>
          )}
        </div>
      ) : null}

      {activeCard ? (
        <div className="collection-overlay" onClick={() => setActiveCard(null)} role="presentation">
          <button
            className="collection-overlay__close"
            onClick={() => setActiveCard(null)}
            type="button"
          >
            Закрыть
          </button>
          <div
            className="collection-overlay__viewer"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <CardViewerCanvas
              card={activeCard}
              introKey={activeCard.instanceId}
              cameraZ={10.6}
              scaleMultiplier={0.7}
              effectsPreset="full"
            />
          </div>
        </div>
      ) : null}

      {rejectingProposal ? (
        <div
          className="admin-dialog-backdrop"
          onClick={() => {
            if (busyId !== rejectingProposal.id) {
              setRejectingProposal(null);
              setRejectionReason('');
            }
          }}
          role="presentation"
        >
          <div
            className="admin-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-rejection-title"
          >
            <div className="admin-dialog__head">
              <strong id="admin-rejection-title">Отклонить карточку</strong>
              <span>{rejectingProposal.title}</span>
            </div>
            <label className="creator-field">
              <span>Причина отказа</span>
              <TextArea
                autoFocus
                debounceMs={400}
                maxLength={280}
                onValueChange={setRejectionReason}
                placeholder="Напиши коротко и по делу, что нужно исправить автору."
                rows={5}
                value={rejectionReason}
              />
            </label>
            <div className="admin-dialog__actions">
              <button
                className="action-button"
                disabled={busyId === rejectingProposal.id}
                onClick={() => {
                  setRejectingProposal(null);
                  setRejectionReason('');
                }}
                type="button"
              >
                Отмена
              </button>
              <button
                className="action-button action-button--solid"
                disabled={busyId === rejectingProposal.id}
                onClick={() => void confirmRejection()}
                type="button"
              >
                Отклонить с причиной
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingCard ? (
        <div
          className="admin-dialog-backdrop"
          onClick={() => {
            if (busyId !== `delete-card:${deletingCard.card.id}`) {
              setDeletingCard(null);
            }
          }}
          role="presentation"
        >
          <div
            className="admin-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-card-delete-title"
          >
            <div className="admin-dialog__head">
              <strong id="admin-card-delete-title">Удалить карточку у всех</strong>
              <span>{deletingCard.card.title}</span>
            </div>
            <p>
              Карточка будет полностью удалена из игры, пропадет из паков и исчезнет у всех
              владельцев.
            </p>
            <div className="admin-metrics">
              <span>Всего копий: {deletingCard.totalOwned}</span>
              <span>Владельцев: {deletingCard.uniqueOwners}</span>
              <span>ID: {deletingCard.card.id}</span>
            </div>
            <div className="admin-dialog__actions">
              <button
                className="action-button"
                disabled={busyId === `delete-card:${deletingCard.card.id}`}
                onClick={() => setDeletingCard(null)}
                type="button"
              >
                Отмена
              </button>
              <button
                className="action-button action-button--solid"
                disabled={busyId === `delete-card:${deletingCard.card.id}`}
                onClick={() => void confirmCardDeletion()}
                type="button"
              >
                Удалить навсегда
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
