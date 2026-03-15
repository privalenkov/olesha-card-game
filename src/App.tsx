import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { GameProvider } from './game/GameContext';
import { useGame } from './game/GameContext';
import { CardCreatorPage } from './pages/CardCreatorPage';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { AdminProposalsPage } from './pages/AdminProposalsPage';

function AppShell() {
  const { authConfigured, authenticated, isAdmin, login, logout, status, updateNickname, user } =
    useGame();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__nav">
          <NavLink
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
            Витрина
          </NavLink>
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
        </div>

        <div className="topbar__auth">
          {status === 'loading' ? (
            <span className="topbar__hint">Сессия...</span>
          ) : authenticated && user ? (
            <>
              <span className="topbar__hint">{user.name}</span>
              <button
                className="topbar__auth-button"
                onClick={async () => {
                  const nextName = window.prompt('Введите новый ник', user.name);

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
              <button className="topbar__auth-button" onClick={() => void logout()} type="button">
                Выйти
              </button>
            </>
          ) : authConfigured ? (
            <button className="topbar__auth-button" onClick={login} type="button">
              Войти через Google
            </button>
          ) : (
            <span className="topbar__hint">Google OAuth не настроен</span>
          )}
        </div>
      </header>

      <main className="page-frame">
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="/collection" element={<CollectionPage />} />
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
      <HashRouter>
        <AppShell />
      </HashRouter>
    </GameProvider>
  );
}
