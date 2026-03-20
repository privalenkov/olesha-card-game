import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { requestProposalStart } from './game/api';
import { GameProvider } from './game/GameContext';
import { useGame } from './game/GameContext';
import { CardCreatorPage } from './pages/CardCreatorPage';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { AdminProposalsPage } from './pages/AdminProposalsPage';
import { RELEASE_NOTES_STORAGE_KEY, RELEASE_NOTES_VERSION } from './releaseNotes';

function hasSeenCurrentReleaseNotes() {
  try {
    return window.localStorage.getItem(RELEASE_NOTES_STORAGE_KEY) === RELEASE_NOTES_VERSION;
  } catch {
    return false;
  }
}

function AppShell() {
  const navigate = useNavigate();
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const {
    authConfigured,
    authenticated,
    dismissNotification,
    isAdmin,
    login,
    logout,
    notify,
    notifications,
    status,
    updateNickname,
    user,
  } = useGame();

  useEffect(() => {
    if (hasSeenCurrentReleaseNotes()) {
      return;
    }

    setReleaseNotesOpen(true);
  }, []);

  function closeReleaseNotes() {
    try {
      window.localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, RELEASE_NOTES_VERSION);
    } catch {
      // Ignore localStorage failures and just close the modal for this session.
    }

    setReleaseNotesOpen(false);
  }

  async function handleProposalStart() {
    if (!authenticated) {
      if (authConfigured) {
        login();
      } else {
        notify({
          kind: 'error',
          title: 'Авторизация недоступна',
          message: 'Google OAuth пока не настроен.',
        });
      }

      return;
    }

    setProposalBusy(true);

    try {
      const response = await requestProposalStart();
      navigate(`/creator/${response.proposal.id}`);
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Не удалось открыть редактор',
        message:
          error instanceof Error
            ? error.message
            : 'Попробуйте еще раз через несколько секунд.',
      });
    } finally {
      setProposalBusy(false);
    }
  }

  return (
    <div className="app-shell">
      {releaseNotesOpen ? <ReleaseNotesModal onClose={closeReleaseNotes} /> : null}

      <div aria-atomic="false" aria-live="polite" className="app-notifications">
        {notifications.map((notification) => (
          <article
            key={notification.id}
            className={`app-notification app-notification--${notification.kind}`}
          >
            <div className="app-notification__copy">
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
            </div>
            <div className="app-notification__actions">
              {notification.cardInstanceId ? (
                <button
                  className="app-notification__button"
                  onClick={() => {
                    void dismissNotification(notification.id);
                    navigate(`/collection?card=${notification.cardInstanceId}`);
                  }}
                  type="button"
                >
                  Открыть в витрине
                </button>
              ) : notification.proposalId ? (
                <button
                  className="app-notification__button"
                  onClick={() => {
                    void dismissNotification(notification.id);
                    navigate(`/creator/${notification.proposalId}`);
                  }}
                  type="button"
                >
                  {notification.kind === 'error' ? 'Изменить' : 'Открыть'}
                </button>
              ) : null}
              <button
                className="app-notification__button"
                onClick={() => {
                  void dismissNotification(notification.id);
                }}
                type="button"
              >
                Закрыть
              </button>
            </div>
          </article>
        ))}
      </div>

      <header className="topbar">
        <div aria-hidden="true" className="topbar__spacer" />

        <nav aria-label="Основная навигация" className="topbar__nav">
          <NavLink
            end
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link--active' : 'nav-link'
            }
            to="/"
          >
            Главная
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link--active' : 'nav-link'
            }
            to="/collection"
          >
            Коллекция
          </NavLink>
          <button
            className="nav-link nav-link--button"
            disabled={proposalBusy}
            onClick={() => {
              void handleProposalStart();
            }}
            type="button"
          >
            {proposalBusy ? 'Открываем редактор' : 'Предложить свою карточку'}
          </button>
          {isAdmin ? (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              to="/admin/proposals"
            >
              Админка
            </NavLink>
          ) : null}
        </nav>

        <div className="topbar__auth">
          {authenticated && user ? (
            <>
              <span className="topbar__hint topbar__hint--user">{user.name}</span>
              <button
                className="topbar__auth-button topbar__auth-button--text"
                onClick={async () => {
                  const nextName = window.prompt(
                    'Введите новый ник (латиница, цифры, "_" или "-")',
                    user.name,
                  );

                  if (nextName === null) {
                    return;
                  }

                  const trimmedName = nextName.trim();

                  if (!trimmedName || trimmedName === user.name) {
                    return;
                  }

                  await updateNickname(trimmedName);
                }}
                type="button"
              >
                Изменить ник
              </button>
              <button
                className="topbar__auth-button topbar__auth-button--text"
                onClick={() => void logout()}
                type="button"
              >
                Выйти
              </button>
            </>
          ) : authConfigured ? (
            <button className="topbar__auth-button" onClick={login} type="button">
              Войти через Google
            </button>
          ) : <></>}
        </div>
      </header>

      <main className="page-frame">
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/collection/:playerSlug" element={<CollectionPage />} />
          <Route path="/creator/:proposalId" element={<CardCreatorPage />} />
          <Route path="/admin/proposals" element={<AdminProposalsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </GameProvider>
  );
}
