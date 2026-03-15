import { useEffect, useMemo, useState } from 'react';
import { rarityMeta } from '../game/config';
import {
  approveProposal,
  deleteProposal,
  fetchAdminCatalog,
  fetchAdminProposals,
  fetchAdminUsers,
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
  Rarity,
} from '../game/types';
import { useCardPreviewImage } from '../three/textures';

type AdminTab = 'proposals' | 'cards' | 'users';
const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'veryrare'];

function ProposalRow({
  proposal,
  busy,
  onApprove,
  onDelete,
}: {
  proposal: CardProposal;
  busy: boolean;
  onApprove: () => void;
  onDelete: () => void;
}) {
  const previewCard = useMemo(() => buildPreviewOwnedCard(proposal), [proposal]);
  const previewImage = useCardPreviewImage(previewCard);

  return (
    <article className="proposal-card">
      <img alt={proposal.title} className="proposal-card__image" src={previewImage} />
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
            Удалить
          </button>
        </div>
      </div>
    </article>
  );
}

function AdminCatalogRow({ item }: { item: AdminCatalogCard }) {
  const previewCard = useMemo(() => buildPreviewCardFromDefinition(item.card), [item.card]);
  const previewImage = useCardPreviewImage(previewCard);

  return (
    <article className="proposal-card">
      <img alt={item.card.title} className="proposal-card__image" src={previewImage} />
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
      </div>
    </article>
  );
}

function AdminUserRow({ user }: { user: AdminUserRecord }) {
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
        <span>Обновлен: {new Date(user.updatedAt).toLocaleString()}</span>
      </div>
    </article>
  );
}

export function AdminProposalsPage() {
  const { isAdmin } = useGame();
  const [tab, setTab] = useState<AdminTab>('proposals');
  const [proposals, setProposals] = useState<CardProposal[]>([]);
  const [cards, setCards] = useState<AdminCatalogCard[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rarityBreakdown = useMemo(() => {
    const totalCards = cards.length;

    return rarityOrder.map((rarity) => {
      const items = cards.filter((item) => item.card.rarity === rarity);
      return {
        rarity,
        count: items.length,
        share: totalCards > 0 ? items.length / totalCards : 0,
        perCardDropChance: items[0]?.dropChancePerPack ?? 0,
      };
    });
  }, [cards]);

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
                onApprove={async () => {
                  setBusyId(proposal.id);

                  try {
                    await approveProposal(proposal.id);
                    setProposals((current) => current.filter((item) => item.id !== proposal.id));
                    const cardsResponse = await fetchAdminCatalog();
                    setCards(cardsResponse.cards);
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
                  setBusyId(proposal.id);

                  try {
                    await deleteProposal(proposal.id);
                    setProposals((current) => current.filter((item) => item.id !== proposal.id));
                    setError(null);
                  } catch (deleteError) {
                    setError(
                      deleteError instanceof Error ? deleteError.message : 'Не удалось удалить предложение.',
                    );
                  } finally {
                    setBusyId(null);
                  }
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
                    <span>Шанс конкретной карточки: {(item.perCardDropChance * 100).toFixed(2)}%</span>
                  </article>
                ))}
              </div>

              <div className="admin-grid">
                {cards.map((item) => (
                  <AdminCatalogRow key={item.card.id} item={item} />
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
            users.map((user) => <AdminUserRow key={user.id} user={user} />)
          ) : (
            <div className="creator-empty empty-state">
              <strong>Пользователей пока нет</strong>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
