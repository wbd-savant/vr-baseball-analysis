import { useSearchParams } from 'react-router-dom';
import { SprayChart } from '../components/charts/SprayChart';
import { VeloChart } from '../components/charts/VeloChart';
import { ZoneChart } from '../components/charts/ZoneChart';
import { StatTable } from '../components/StatTable';
import { ko } from '../i18n/ko';
import { seasonOrder } from '../lib/display';
import {
  HITTING_BATTED_BALL,
  HITTING_DISCIPLINE,
  HITTING_STANDARD,
  PITCHING_STANDARD,
  PITCHING_STUFF,
  splitColumns,
  type StatCol,
} from '../lib/stats';
import type { GameSummary, League as LeagueFile, LeagueSeasonFile, Role } from '../lib/types';
import { useData } from '../lib/useData';

export function League() {
  const [params, setParams] = useSearchParams();
  const league = useData<LeagueFile>('league.json');
  const games = useData<GameSummary[]>('games.json').data;
  const seasons = seasonOrder(Object.keys(league.data?.seasons ?? {}), games);
  const current = seasons.includes(params.get('season') ?? '') ? params.get('season')! : seasons[0];
  const detail = useData<LeagueSeasonFile>(current ? `league/${current}.json` : null).data;

  if (league.error) return <main className="page"><p className="error">{ko.gate.loadError}</p></main>;
  if (!league.data || !current) return <main className="page"><p className="muted">{ko.common.loading}</p></main>;
  const lines = league.data.seasons;

  // One row per season, so seasons compare at a glance; rates show their samples as everywhere else.
  const table = (role: Role, cols: StatCol[], title: string) => (
    <>
      <h3>{title}</h3>
      <StatTable
        role={role}
        season={current}
        cols={cols}
        rows={seasons.map((s) => ({ key: s, line: lines[s][role], lead: [s, ko.league.gamesN(lines[s].games)] }))}
        leadHeaders={[ko.league.season, ko.league.games]}
      />
    </>
  );
  const pitches = detail?.pitches ?? [];

  return (
    <main className="page">
      <header className="player-head">
        <h1>{ko.league.title}</h1>
        <p className="muted small">{ko.league.note}</p>
        {seasons.length > 1 && (
          <label className="inline">
            {ko.league.season}{' '}
            <select value={current} onChange={(e) => setParams({ season: e.target.value }, { replace: true })}>
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      <section>
        <h2>{ko.player.batting}</h2>
        {table('batting', HITTING_STANDARD, ko.player.standard)}
        {table('batting', HITTING_DISCIPLINE, ko.player.discipline)}
        {table('batting', HITTING_BATTED_BALL, ko.player.battedBall)}
      </section>
      <section>
        <h2>{ko.player.pitching}</h2>
        {table('pitching', PITCHING_STANDARD, ko.player.standard)}
        {table('pitching', PITCHING_STUFF, ko.player.stuff)}
      </section>

      <section>
        <h2>
          {ko.league.charts} <span className="muted small">{current}</span>
        </h2>
        {detail && !pitches.length && <p className="muted">{ko.league.noCharts}</p>}
        {pitches.length > 0 && (
          <>
            <p className="muted small">
              {ko.league.chartsNote} {ko.charts.pitchesShown(pitches.length)}
            </p>
            <div className="chart-grid">
              <SprayChart rows={pitches} />
              <ZoneChart rows={pitches} />
              <VeloChart rows={pitches} all={pitches} role="pitching" />
            </div>
          </>
        )}
      </section>

      {detail && detail.splits.length > 0 && (
        <section>
          <h2>
            {ko.league.splits} <span className="muted small">{current}</span>
          </h2>
          <p className="muted small">{ko.player.splitsNote}</p>
          <StatTable
            role="batting"
            season={current}
            cols={splitColumns('batting')}
            rows={detail.splits.map((sp) => ({ key: sp.key, line: sp, lead: [ko.splits[sp.key] ?? sp.key] }))}
            leadHeaders={[ko.player.split]}
          />
        </section>
      )}
    </main>
  );
}
