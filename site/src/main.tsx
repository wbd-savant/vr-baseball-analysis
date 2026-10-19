import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { FullOnly, PasswordGate, useAccess } from './components/PasswordGate';
import { SearchBox } from './components/SearchBox';
import { Glossary } from './pages/Glossary';
import { Home } from './pages/Home';
import { League } from './pages/League';
import { Leaderboard } from './pages/Leaderboard';
import { Player } from './pages/Player';
import { Report } from './pages/Report';
import { ko } from './i18n/ko';
import { isPublicMode, lock } from './lib/loadData';
import type { Meta } from './lib/types';
import { useData } from './lib/useData';
import './styles.css';

export function App() {
  return (
    <PasswordGate>
      <Site />
    </PasswordGate>
  );
}

/** Without the password only the example players' pages (and the glossary) are open. */
function SampleOnly() {
  const { samplePlayers } = useAccess();
  const slug = useParams().slug;
  return samplePlayers.some((p) => p.slug === slug) ? <Player /> : <FullOnly />;
}

function Site() {
  const { full, samplePlayers, openGate } = useAccess();
  // Reports are password only, so the link appears (and meta.json loads) only once unlocked.
  const report = useData<Meta>(full ? 'meta.json' : null).data?.reports?.at(-1);
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">
          {ko.siteName}
        </NavLink>
        <nav>
          {full && <NavLink to="/leaderboard">{ko.nav.leaderboard}</NavLink>}
          {full && <NavLink to="/league">{ko.nav.league}</NavLink>}
          {full && report && <NavLink to={`/report/${report}`}>{ko.report.nav}</NavLink>}
          <NavLink to="/glossary">{ko.nav.glossary}</NavLink>
        </nav>
        {full && <SearchBox />}
        {!full && (
          <button type="button" onClick={openGate}>
            {ko.gate.fullVersion}
          </button>
        )}
        {full && !isPublicMode && (
          <button
            className="link"
            onClick={() => {
              lock();
              location.reload();
            }}
          >
            {ko.common.lock}
          </button>
        )}
      </header>
      {!full && (
        <p className="notice sample-banner">
          {ko.gate.sampleBanner} {ko.gate.samplePlayers}{' '}
          {samplePlayers.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && ' · '}
              <NavLink to={`/player/${p.slug}`}>{p.name}</NavLink>
            </span>
          ))}{' '}
          <button type="button" className="link" onClick={openGate}>
            {ko.gate.fullVersion}
          </button>
        </p>
      )}
      <Routes>
        <Route path="/" element={full ? <Home /> : <Navigate to={`/player/${samplePlayers[0]?.slug}`} replace />} />
        <Route path="/leaderboard" element={full ? <Leaderboard /> : <FullOnly />} />
        <Route path="/league" element={full ? <League /> : <FullOnly />} />
        <Route path="/player/:slug" element={full ? <Player /> : <SampleOnly />} />
        <Route path="/report/:season" element={full ? <Report /> : <FullOnly />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="*" element={<main className="page"><p>{ko.common.notFound}</p></main>} />
      </Routes>
    </>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
}
