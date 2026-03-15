import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { GameProvider } from './game/GameContext';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';

function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
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
      </header>

      <main className="page-frame">
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="/collection" element={<CollectionPage />} />
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
