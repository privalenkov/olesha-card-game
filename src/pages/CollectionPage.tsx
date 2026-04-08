import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CollectionCardTile } from '../components/CollectionCardTile';
import { OwnedCardViewerOverlay } from '../components/OwnedCardViewerOverlay';
import { ApiError, fetchPublicShowcase } from '../game/api';
import { buildCollectionPath } from '../game/collectionPaths';
import { useGame } from '../game/GameContext';
import type { CollectionFilter, OwnedCard, PublicPlayerProfile } from '../game/types';

type CollectionTab = CollectionFilter;

const COLLECTION_PAGE_SIZE = 16;

export function CollectionPage() {
  const navigate = useNavigate();
  const { playerSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authenticated, user } = useGame();
  const [activeCard, setActiveCard] = useState<OwnedCard | null>(null);
  const [activeTab, setActiveTab] = useState<CollectionTab>('all');
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
                ? 'Не удалось догрузить карточки коллекции.'
                : 'Не удалось загрузить коллекцию игрока.';

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

  const isRemoteCollection = Boolean(activePlayerSlug) && !isOwnCollection;
  const canFilterCreatedCards = Boolean(activePlayerSlug);
  const createdTabLabel = isOwnCollection ? 'Созданные мной' : 'Созданные пользователем';
  const emptyTitle = isRemoteCollection
    ? 'У этого игрока пока нет карточек'
    : authenticated
      ? 'Коллекция пока пустая'
      : 'Открой ссылку игрока или войди в аккаунт';
  const filteredCount = activeTab === 'duplicates' ? duplicateCount : filteredTotal;
  const filteredEmptyTitle =
    activeTab === 'duplicates'
      ? 'Дубликаты пока не найдены'
      : activeTab === 'created'
        ? isOwnCollection
          ? 'Карточки, созданные мной, пока не найдены'
          : 'Карточки, созданные пользователем, пока не найдены'
        : emptyTitle;

  return (
    <div className="page page--collection page--collection-minimal">
      <section className="collection-toolbar">
        <div className="collection-owner">
          <strong className="collection-owner__name">{viewedOwner?.name ?? 'Игрок'}</strong>
          <span className="collection-owner__label">Профиль</span>
        </div>

        <div className="collection-breakdown collection-breakdown--minimal">
          <div className="collection-breakdown__item">
            <strong>{totalCards}</strong>
            <span>Всего карточек</span>
          </div>
          <div className="collection-breakdown__item">
            <strong>{duplicateCount}</strong>
            <span>Дубли карточек</span>
          </div>
        </div>

        <div
          className="collection-toolbar__filters filter-pills"
          role="tablist"
          aria-label="Фильтр коллекции"
        >
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
            Дубликаты
          </button>
          {canFilterCreatedCards ? (
            <button
              className={`filter-pill ${activeTab === 'created' ? 'filter-pill--active' : ''}`}
              onClick={() => setActiveTab('created')}
              type="button"
            >
              {createdTabLabel}
            </button>
          ) : null}
        </div>
      </section>

      {Boolean(activePlayerSlug) && collectionStatus === 'loading' ? (
        <section className="collection-empty">
          <strong>Загружаем коллекцию...</strong>
        </section>
      ) : Boolean(activePlayerSlug) && collectionStatus === 'error' ? (
        <section className="collection-empty">
          <strong>{collectionError ?? 'Не удалось загрузить коллекцию игрока'}</strong>
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
          <strong>{filteredEmptyTitle}</strong>
        </section>
      )}

      {loadingMoreCards && loadedCards.length > 0 ? (
        <section className="collection-pagination">
          <strong>Подгружаем коллекцию...</strong>
        </section>
      ) : null}

      {activeCard ? (
        <OwnedCardViewerOverlay
          card={activeCard}
          onClose={closeViewer}
          sharePlayerSlug={viewedOwner?.shareSlug?.trim() || activePlayerSlug}
        />
      ) : null}
    </div>
  );
}
