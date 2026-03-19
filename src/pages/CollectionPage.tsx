import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardViewerCanvas } from '../components/CardViewerCanvas';
import { CollectionCardTile } from '../components/CollectionCardTile';
import {
  ApiError,
  EMPTY_REMOTE_GAME_STATE,
  fetchPublicShowcase,
  requestProposalStart,
} from '../game/api';
import { useGame } from '../game/GameContext';
import type { OwnedCard, PublicPlayerProfile, RemoteGameState } from '../game/types';

type CollectionTab = 'all' | 'duplicates';

function buildCollectionPath(playerSlug: string, searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  return `/collection/${encodeURIComponent(playerSlug)}${query ? `?${query}` : ''}`;
}

export function CollectionPage() {
  const navigate = useNavigate();
  const { playerSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authConfigured, authenticated, login, state, user } = useGame();
  const [activeCard, setActiveCard] = useState<OwnedCard | null>(null);
  const [activeTab, setActiveTab] = useState<CollectionTab>('all');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [publicOwner, setPublicOwner] = useState<PublicPlayerProfile | null>(null);
  const [publicState, setPublicState] = useState<RemoteGameState | null>(null);
  const [publicStatus, setPublicStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [publicError, setPublicError] = useState<string | null>(null);
  const requestedCardInstanceId = searchParams.get('card');
  const activePlayerSlug = playerSlug?.trim() ?? '';

  const isCurrentUsersSlug =
    Boolean(authenticated && user && activePlayerSlug) && activePlayerSlug === user?.shareSlug;
  const isOwnCollection = Boolean(authenticated && user) && (!activePlayerSlug || isCurrentUsersSlug);
  const viewedOwner =
    isOwnCollection && user
      ? {
          id: user.id,
          name: user.name,
          shareSlug: user.shareSlug,
          avatarUrl: user.avatarUrl,
        }
      : publicOwner;
  const collectionState = isOwnCollection ? state : publicState ?? EMPTY_REMOTE_GAME_STATE;
  const collectionReady =
    !activePlayerSlug || isOwnCollection || publicStatus === 'ready' || publicStatus === 'error';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveCard(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!authenticated || !user || activePlayerSlug) {
      return;
    }

    navigate(buildCollectionPath(user.shareSlug, searchParams), { replace: true });
  }, [activePlayerSlug, authenticated, navigate, searchParams, user]);

  useEffect(() => {
    if (!activePlayerSlug) {
      setPublicOwner(null);
      setPublicState(null);
      setPublicStatus('idle');
      setPublicError(null);
      return;
    }

    if (authenticated && user && activePlayerSlug === user.shareSlug) {
      setPublicOwner(null);
      setPublicState(null);
      setPublicStatus('ready');
      setPublicError(null);
      return;
    }

    let cancelled = false;
    setPublicStatus('loading');
    setPublicError(null);

    void fetchPublicShowcase(activePlayerSlug)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setPublicOwner(response.user);
        setPublicState(response.game);
        setPublicStatus('ready');
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }

        const message =
          requestError instanceof ApiError
            ? requestError.message
            : requestError instanceof Error
              ? requestError.message
              : 'Не удалось загрузить витрину игрока.';

        setPublicOwner(null);
        setPublicState(null);
        setPublicStatus('error');
        setPublicError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [activePlayerSlug, authenticated, user]);

  useEffect(() => {
    if (!authenticated || !user || !publicOwner || !activePlayerSlug) {
      return;
    }

    if (publicOwner.id !== user.id || activePlayerSlug === user.shareSlug) {
      return;
    }

    navigate(buildCollectionPath(user.shareSlug, searchParams), { replace: true });
  }, [activePlayerSlug, authenticated, navigate, publicOwner, searchParams, user]);

  const duplicateCards = useMemo(() => {
    const seen = new Set<string>();

    return collectionState.collection.filter((card) => {
      if (seen.has(card.id)) {
        return true;
      }

      seen.add(card.id);
      return false;
    });
  }, [collectionState.collection]);

  const visibleCards = activeTab === 'duplicates' ? duplicateCards : collectionState.collection;
  const duplicateCount = duplicateCards.length;

  useEffect(() => {
    if (!requestedCardInstanceId || !collectionReady) {
      return;
    }

    const matchingCard = collectionState.collection.find(
      (card) => card.instanceId === requestedCardInstanceId,
    );

    if (matchingCard) {
      setActiveCard(matchingCard);
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('card');
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    collectionReady,
    collectionState.collection,
    requestedCardInstanceId,
    searchParams,
    setSearchParams,
  ]);

  function closeViewer() {
    setActiveCard(null);

    if (!requestedCardInstanceId) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('card');
    setSearchParams(nextSearchParams, { replace: true });
  }

  const showProposalAction = !activePlayerSlug || isOwnCollection;
  const isRemoteCollection = Boolean(activePlayerSlug) && !isOwnCollection;
  const ownerSubtitle = isOwnCollection
    ? 'Твоя публичная витрина'
    : viewedOwner
      ? 'Публичная витрина игрока'
      : 'Витрина игрока';
  const emptyTitle = isRemoteCollection
    ? 'У этого игрока пока нет карточек'
    : authenticated
      ? 'Коллекция пока пустая'
      : 'Открой ссылку игрока или войди в аккаунт';

  return (
    <div className="page page--collection page--collection-minimal">
      <section className="collection-toolbar">
        <div className="collection-owner">
          <span>{ownerSubtitle}</span>
          <strong>{viewedOwner?.name ?? 'Витрина'}</strong>
        </div>

        <div className="collection-breakdown collection-breakdown--minimal">
          <div>
            <strong>{collectionState.collection.length}</strong>
            <span>Всего карточек</span>
          </div>
          <div>
            <strong>{duplicateCount}</strong>
            <span>Повторок</span>
          </div>
        </div>

        <div className="filter-pills" role="tablist" aria-label="Фильтр коллекции">
          <button
            className={`filter-pill ${activeTab === 'all' ? 'filter-pill--active' : ''}`}
            onClick={() => setActiveTab('all')}
            type="button"
          >
            Все
          </button>
          <button
            className={`filter-pill ${activeTab === 'duplicates' ? 'filter-pill--active' : ''}`}
            onClick={() => setActiveTab('duplicates')}
            type="button"
          >
            Повторки
          </button>
        </div>

        {showProposalAction ? (
          <button
            className="collection-toolbar__action action-button"
            disabled={proposalBusy}
            onClick={async () => {
              if (!authenticated) {
                if (authConfigured) {
                  login();
                }

                return;
              }

              setProposalBusy(true);

              try {
                const response = await requestProposalStart();
                navigate(`/creator/${response.proposal.id}`);
              } finally {
                setProposalBusy(false);
              }
            }}
            type="button"
          >
            Предложить свою карточку
          </button>
        ) : null}
      </section>

      {isRemoteCollection && publicStatus === 'loading' ? (
        <section className="collection-empty">
          <strong>Загружаем витрину...</strong>
        </section>
      ) : isRemoteCollection && publicStatus === 'error' ? (
        <section className="collection-empty">
          <strong>{publicError ?? 'Не удалось загрузить витрину игрока'}</strong>
        </section>
      ) : collectionState.collection.length === 0 ? (
        <section className="collection-empty">
          <strong>{emptyTitle}</strong>
        </section>
      ) : visibleCards.length > 0 ? (
        <section className="collection-grid collection-grid--minimal">
          {visibleCards.map((card) => (
            <CollectionCardTile key={card.instanceId} card={card} onOpen={setActiveCard} />
          ))}
        </section>
      ) : (
        <section className="collection-empty collection-empty--compact">
          <strong>Повторок пока нет</strong>
        </section>
      )}

      {activeCard ? (
        <div className="collection-overlay" onClick={closeViewer} role="presentation">
          <button className="collection-overlay__close" onClick={closeViewer} type="button">
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
    </div>
  );
}
