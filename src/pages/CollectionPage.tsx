import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardCreatorLink } from '../components/CardCreatorLink';
import { CardViewerCanvas } from '../components/CardViewerCanvas';
import { CollectionCardTile } from '../components/CollectionCardTile';
import { ApiError, fetchPublicShowcase, requestProposalStart } from '../game/api';
import { buildCollectionPath } from '../game/collectionPaths';
import { useGame } from '../game/GameContext';
import type { CollectionFilter, OwnedCard, PublicPlayerProfile } from '../game/types';

type CollectionTab = CollectionFilter;

const COLLECTION_PAGE_SIZE = 16;

export function CollectionPage() {
  const navigate = useNavigate();
  const { playerSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authConfigured, authenticated, login, user } = useGame();
  const [activeCard, setActiveCard] = useState<OwnedCard | null>(null);
  const [activeCardCreatorVisible, setActiveCardCreatorVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<CollectionTab>('all');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [collectionOwner, setCollectionOwner] = useState<PublicPlayerProfile | null>(null);
  const [loadedCards, setLoadedCards] = useState<OwnedCard[]>([]);
  const [collectionStatus, setCollectionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasMoreCards, setHasMoreCards] = useState(false);
  const [loadingMoreCards, setLoadingMoreCards] = useState(false);
  const requestedCardInstanceId = searchParams.get('card');
  const activePlayerSlug = playerSlug?.trim() ?? '';
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestKeyRef = useRef(0);

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
      : collectionOwner;
  const collectionReady = collectionStatus === 'ready' || collectionStatus === 'error';
  const handleActiveCardIntroComplete = useCallback(() => {
    setActiveCardCreatorVisible(true);
  }, []);

  useEffect(() => {
    setActiveCardCreatorVisible(false);
  }, [activeCard?.instanceId]);

  const resetCollectionState = useCallback(() => {
    setCollectionOwner(null);
    setLoadedCards([]);
    setCollectionStatus('idle');
    setCollectionError(null);
    setTotalCards(0);
    setDuplicateCount(0);
    setFilteredTotal(0);
    setHasMoreCards(false);
    setLoadingMoreCards(false);
  }, []);

  const applyCollectionResponse = useCallback(
    (
      response: Awaited<ReturnType<typeof fetchPublicShowcase>>,
      mode: 'replace' | 'append',
    ) => {
      setCollectionOwner(response.user);
      setTotalCards(response.totalCards);
      setDuplicateCount(response.duplicateCards);
      setFilteredTotal(response.filteredTotal);
      setHasMoreCards(response.hasMore);
      setCollectionStatus('ready');
      setCollectionError(null);

      if (mode === 'replace') {
        setLoadedCards(response.cards);
        return;
      }

      setLoadedCards((currentCards) => {
        const seen = new Set(currentCards.map((card) => card.instanceId));
        const nextCards = response.cards.filter((card) => !seen.has(card.instanceId));
        return [...currentCards, ...nextCards];
      });
    },
    [],
  );

  const loadCollectionPage = useCallback(
    async ({
      offset,
      mode,
      requestKey = requestKeyRef.current,
    }: {
      offset: number;
      mode: 'replace' | 'append';
      requestKey?: number;
    }) => {
      if (!activePlayerSlug) {
        return false;
      }

      try {
        const response = await fetchPublicShowcase(activePlayerSlug, {
          filter: activeTab,
          limit: COLLECTION_PAGE_SIZE,
          offset,
        });

        if (requestKeyRef.current !== requestKey) {
          return false;
        }

        applyCollectionResponse(response, mode);
        return true;
      } catch (requestError) {
        if (requestKeyRef.current !== requestKey) {
          return false;
        }

        const message =
          requestError instanceof ApiError
            ? requestError.message
            : requestError instanceof Error
              ? requestError.message
              : mode === 'append'
                ? 'Не удалось догрузить карточки витрины.'
                : 'Не удалось загрузить витрину игрока.';

        if (mode === 'replace') {
          resetCollectionState();
          setCollectionStatus('error');
        }

        setCollectionError(message);
        return false;
      }
    },
    [activePlayerSlug, activeTab, applyCollectionResponse, resetCollectionState],
  );

  const loadMoreCardsPage = useCallback(async () => {
    if (
      !activePlayerSlug ||
      collectionStatus !== 'ready' ||
      loadingMoreCards ||
      !hasMoreCards
    ) {
      return false;
    }

    const currentRequestKey = requestKeyRef.current;
    setLoadingMoreCards(true);

    try {
      return await loadCollectionPage({
        offset: loadedCards.length,
        mode: 'append',
        requestKey: currentRequestKey,
      });
    } finally {
      if (requestKeyRef.current === currentRequestKey) {
        setLoadingMoreCards(false);
      }
    }
  }, [
    activePlayerSlug,
    collectionStatus,
    hasMoreCards,
    loadCollectionPage,
    loadedCards.length,
    loadingMoreCards,
  ]);

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
      requestKeyRef.current += 1;
      resetCollectionState();
      return;
    }

    const currentRequestKey = requestKeyRef.current + 1;
    requestKeyRef.current = currentRequestKey;
    setCollectionStatus('loading');
    setCollectionError(null);
    setLoadedCards([]);
    setFilteredTotal(0);
    setHasMoreCards(false);
    setLoadingMoreCards(false);

    void loadCollectionPage({
      offset: 0,
      mode: 'replace',
      requestKey: currentRequestKey,
    });
  }, [activePlayerSlug, activeTab, loadCollectionPage, resetCollectionState]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMoreCards || collectionStatus !== 'ready') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreCardsPage();
        }
      },
      {
        rootMargin: '360px 0px',
      },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [collectionStatus, hasMoreCards, loadMoreCardsPage, loadedCards.length]);

  useEffect(() => {
    if (requestedCardInstanceId && activeTab !== 'all') {
      setActiveTab('all');
    }
  }, [activeTab, requestedCardInstanceId]);

  useEffect(() => {
    if (!requestedCardInstanceId || !collectionReady) {
      return;
    }

    const matchingCard = loadedCards.find((card) => card.instanceId === requestedCardInstanceId);

    if (matchingCard) {
      setActiveCard(matchingCard);
      return;
    }

    if (hasMoreCards && !loadingMoreCards && activeTab === 'all') {
      void loadMoreCardsPage();
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('card');
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    activeTab,
    collectionReady,
    hasMoreCards,
    loadedCards,
    loadMoreCardsPage,
    loadingMoreCards,
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
  const filteredCount = activeTab === 'duplicates' ? duplicateCount : filteredTotal;

  return (
    <div className="page page--collection page--collection-minimal">
      <section className="collection-toolbar">
        <div className="collection-owner">
          <span>{ownerSubtitle}</span>
          <strong>{viewedOwner?.name ?? 'Витрина'}</strong>
        </div>

        <div className="collection-breakdown collection-breakdown--minimal">
          <div>
            <strong>{totalCards}</strong>
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

      {Boolean(activePlayerSlug) && collectionStatus === 'loading' ? (
        <section className="collection-empty">
          <strong>Загружаем витрину...</strong>
        </section>
      ) : Boolean(activePlayerSlug) && collectionStatus === 'error' ? (
        <section className="collection-empty">
          <strong>{collectionError ?? 'Не удалось загрузить витрину игрока'}</strong>
        </section>
      ) : totalCards === 0 ? (
        <section className="collection-empty">
          <strong>{emptyTitle}</strong>
        </section>
      ) : filteredCount > 0 ? (
        <section className="collection-grid collection-grid--minimal">
          {loadedCards.map((card) => (
            <CollectionCardTile key={card.instanceId} card={card} onOpen={setActiveCard} />
          ))}
          {hasMoreCards ? (
            <div
              ref={loadMoreRef}
              aria-hidden="true"
              className="collection-grid__sentinel"
            />
          ) : null}
        </section>
      ) : (
        <section className="collection-empty collection-empty--compact">
          <strong>Повторок пока нет</strong>
        </section>
      )}

      {loadingMoreCards && loadedCards.length > 0 ? (
        <section className="collection-pagination">
          <strong>Подгружаем еще карточки...</strong>
        </section>
      ) : null}

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
            <div className="collection-overlay__viewer-stage">
              <div className="collection-overlay__viewer-canvas">
                <CardViewerCanvas
                  card={activeCard}
                  introKey={activeCard.instanceId}
                  cameraZ={10.6}
                  scaleMultiplier={0.7}
                  effectsPreset="full"
                  onIntroComplete={handleActiveCardIntroComplete}
                />
              </div>
              <CardCreatorLink
                card={activeCard}
                cameraZ={10.6}
                scaleMultiplier={0.7}
                visible={activeCardCreatorVisible}
                className="card-creator-link-anchor--overlay"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
