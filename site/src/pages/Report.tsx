import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ko } from '../i18n/ko';
import { formatStat } from '../lib/format';
import type { DisciplineCounts, League, ReportFile, ResultLine, Trend } from '../lib/types';
import { useData } from '../lib/useData';

const t = ko.report;

/** A table cell: a value, plus its sample (shown small, as everywhere on the site). */
interface Cell {
  v: string;
  n?: string;
}

const plain = (v: unknown, kind: 'int' | 'avg' | 'dec1' = 'int'): Cell => ({ v: formatStat(v, kind) });
/** Rate num/den, shown with "num/den" as its sample. */
const rate = (num: number, den: number): Cell => (den ? { v: formatStat(num / den, 'pct'), n: `${num}/${den}` } : { v: '–' });
/** A batting rate whose sample is the PA (or AB) count. */
const withPa = (v: number | null, kind: 'avg', n: number): Cell => (v === null ? { v: '–' } : { v: formatStat(v, kind), n: String(n) });
const p3 = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));
/** p with its sign for sentences: "=0.012" or "<0.001". */
const pRel = (p: number) => (p < 0.001 ? '<0.001' : `=${p.toFixed(3)}`);
const d2 = (x: number) => x.toFixed(2);

function CellView({ c }: { c: Cell }) {
  return (
    <>
      {c.v}
      {c.n && (
        <small className="n" title={t.sampleCell(c.n)}>
          {c.n}
        </small>
      )}
    </>
  );
}

/** Rows of labelled cells under a header row. */
function Grid({ head, rows }: { head: ReactNode[]; rows: { label: ReactNode; cells: Cell[] }[] }) {
  return (
    <div className="table-wrap">
      <table className="stats">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === 0 ? 'lead' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="lead">{r.label}</td>
              {r.cells.map((c, j) => (
                <td key={j}>
                  <CellView c={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const disciplineRows = (cols: DisciplineCounts[]) => [
  { label: t.rows.pitches, cells: cols.map((d) => plain(d.pitches)) },
  { label: t.rows.swing, cells: cols.map((d) => rate(d.swings, d.pitches)) },
  { label: t.rows.whiff, cells: cols.map((d) => rate(d.whiffs, d.swings)) },
  { label: t.rows.contact, cells: cols.map((d) => rate(d.swings - d.whiffs, d.swings)) },
  { label: t.rows.swstr, cells: cols.map((d) => rate(d.whiffs, d.pitches)) },
  { label: t.rows.called, cells: cols.map((d) => rate(d.called, d.pitches)) },
  { label: t.rows.csw, cells: cols.map((d) => rate(d.called + d.whiffs, d.pitches)) },
  { label: t.rows.zone, cells: cols.map((d) => rate(d.zone_pitches, d.located)) },
  { label: t.rows.zoneSwing, cells: cols.map((d) => rate(d.zone_swings, d.zone_pitches)) },
  { label: t.rows.chase, cells: cols.map((d) => rate(d.chase_swings, d.chase_pitches)) },
  { label: t.rows.zoneContact, cells: cols.map((d) => rate(d.zone_swings - d.zone_whiffs, d.zone_swings)) },
  { label: t.rows.chaseContact, cells: cols.map((d) => rate(d.chase_swings - d.chase_whiffs, d.chase_swings)) },
  { label: t.rows.foul, cells: cols.map((d) => rate(d.fouls, d.swings)) },
  { label: t.rows.inPlay, cells: cols.map((d) => rate(d.in_play, d.swings)) },
];

const resultRows = (cols: ResultLine[]) => [
  { label: t.rows.pa, cells: cols.map((r) => plain(r.pa)) },
  { label: t.rows.avg, cells: cols.map((r) => withPa(r.avg, 'avg', r.ab)) },
  { label: t.rows.obp, cells: cols.map((r) => withPa(r.obp, 'avg', r.pa)) },
  { label: t.rows.slg, cells: cols.map((r) => withPa(r.slg, 'avg', r.ab)) },
  { label: t.rows.ops, cells: cols.map((r) => withPa(r.ops, 'avg', r.pa)) },
  { label: t.rows.k, cells: cols.map((r) => rate(r.k, r.pa)) },
  { label: t.rows.bb, cells: cols.map((r) => rate(r.bb, r.pa)) },
  { label: t.rows.hr, cells: cols.map((r) => plain(r.hr)) },
];

/** One finding sentence per trend, strongest evidence first. */
function trendFindings(r: ReportFile): string[] {
  const name = (id: string) => r.pitchers.find((p) => p.id === id)?.name ?? id;
  return Object.entries(r.trends)
    .filter((e): e is [string, Trend] => e[1] !== null)
    .sort((a, b) => a[1].p - b[1].p)
    .map(([key, tr]) => {
      const lead = t.trendSentence(t.metrics[key], tr.or > 1, d2(tr.or), d2(tr.lo), d2(tr.hi), pRel(tr.p), `${tr.n}${t.units[key]}`);
      if (tr.p >= 0.05) return `${lead} ${t.verdict.none}`;
      const notes: string[] = [];
      const withinHolds = tr.within !== null && tr.within.p < 0.05;
      const dropHolds = tr.without_one === null || tr.without_one.p < 0.05;
      if (withinHolds && dropHolds) notes.push(t.verdict.solid);
      if (!withinHolds) notes.push(t.verdict.between);
      if (!dropHolds && tr.without_one) notes.push(t.verdict.fragile(name(tr.without_one.pitcher_id), pRel(tr.without_one.p)));
      return `${lead} ${notes.join(' ')}`;
    });
}

export function Report() {
  const { season } = useParams();
  const file = useData<ReportFile>(season ? `report/${season}.json` : null);
  const typeNames = useData<League>('league.json').data?.pitch_types ?? {};

  if (file.error) return <main className="page"><p>{ko.common.notFound}</p></main>;
  if (!file.data) return <main className="page"><p className="muted">{ko.common.loading}</p></main>;
  const r = file.data;
  const s = r.sample;
  const bandHead = (bands: string[]) => [t.bandHead, ...bands.map((b) => t.bands[b] ?? b)];
  const all = r.direction_all;
  const pctOf = (num: number, den: number) => (den ? formatStat(num / den, 'pct') : '–');
  const findings = trendFindings(r);
  if (r.fatigue) {
    const f = r.fatigue;
    findings.push(t.fatigueSentence((f.slope > 0 ? '+' : '') + f.slope.toFixed(1), f.lo.toFixed(1), f.hi.toFixed(1), pRel(f.p), f.n, f.outings));
  }
  if (all.located) findings.push(t.directionSentence(pctOf(all.pull, all.located), pctOf(all.center, all.located), pctOf(all.oppo, all.located), all.located));

  return (
    <main className="page report">
      <h1>{t.title(r.season)}</h1>
      <p className="muted small">{t.privateNote}</p>
      <p>
        {t.sample({
          games: s.games, pitches: s.pitches, velo: s.velo_pitches, min: formatStat(s.velo_min, 'int'), max: formatStat(s.velo_max, 'int'),
          pa: s.pa, bip: s.bip, pitchers: s.pitchers, batters: s.batters,
        })}
        {s.partial_games > 0 && ` ${t.partial(s.partial_games)}`}
      </p>

      <h2>{t.findings}</h2>
      <ul className="findings">
        {findings.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <p className="muted small">{t.findingsNote}</p>

      <h2>{t.discipline}</h2>
      <p className="muted small">{t.disciplineNote}</p>
      <Grid
        head={[...bandHead(r.discipline.map((d) => d.band)), t.all]}
        rows={[
          { label: t.rows.veloAvg, cells: [...r.discipline, r.discipline_all].map((d) => plain(d.velo_avg, 'dec1')) },
          { label: t.rows.pitchers, cells: [...r.discipline, r.discipline_all].map((d) => plain(d.pitchers)) },
          ...disciplineRows([...r.discipline, r.discipline_all]),
        ]}
      />
      <h3>{t.fastballsOnly}</h3>
      <Grid head={bandHead(r.discipline_fastballs.map((d) => d.band))} rows={disciplineRows(r.discipline_fastballs).filter((_, i) => [0, 1, 2, 9].includes(i))} />

      <h2>{t.results}</h2>
      <p className="muted small">{t.resultsNote}</p>
      <Grid head={[...bandHead(r.results.map((x) => x.band)), t.all]} rows={resultRows([...r.results, r.results_all])} />
      <h3>{t.byPitcherSpeed}</h3>
      <p className="muted small">{t.byPitcherSpeedNote}</p>
      <Grid
        head={['', ...r.results_by_pitcher_speed.map((g) => t.pitcherGroup(g.group, formatStat(g.lo, 'dec1'), formatStat(g.hi, 'dec1'), g.pitchers))]}
        rows={resultRows(r.results_by_pitcher_speed)}
      />

      <h2>{t.direction}</h2>
      <p className="muted small">{t.directionNote}</p>
      <Grid
        head={[...bandHead(r.direction.map((x) => x.band)), t.all]}
        rows={(() => {
          const cols = [...r.direction, all];
          return [
            { label: t.rows.bip, cells: cols.map((d) => plain(d.bip)) },
            { label: t.rows.pull, cells: cols.map((d) => rate(d.pull, d.located)) },
            { label: t.rows.center, cells: cols.map((d) => rate(d.center, d.located)) },
            { label: t.rows.oppo, cells: cols.map((d) => rate(d.oppo, d.located)) },
            { label: t.rows.ground, cells: cols.map((d) => rate(d.ground, d.typed)) },
            { label: t.rows.line, cells: cols.map((d) => rate(d.line, d.typed)) },
            { label: t.rows.fly, cells: cols.map((d) => rate(d.fly + d.popup, d.typed)) },
            { label: t.rows.hard, cells: cols.map((d) => rate(d.hard, d.rated)) },
            { label: t.rows.hitRate, cells: cols.map((d) => rate(d.hits, d.bip)) },
          ];
        })()}
      />
      <h3>{t.directionHits}</h3>
      <Grid
        head={['', t.rows.pull, t.rows.center, t.rows.oppo]}
        rows={[{ label: t.rows.hitRate, cells: [rate(all.pull_hits, all.pull), rate(all.center_hits, all.center), rate(all.oppo_hits, all.oppo)] }]}
      />

      <h2>{t.trends}</h2>
      <p className="muted small">{t.trendsNote}</p>
      <Grid
        head={[t.trendCols.metric, t.trendCols.n, t.trendCols.or, t.trendCols.ci, t.trendCols.p, t.trendCols.within, t.trendCols.without]}
        rows={Object.entries(r.trends)
          .filter((e): e is [string, Trend] => e[1] !== null)
          .map(([key, tr]) => ({
            label: t.metrics[key],
            cells: [
              { v: `${tr.n}`, n: t.units[key] },
              { v: d2(tr.or) },
              { v: `${d2(tr.lo)}–${d2(tr.hi)}` },
              { v: p3(tr.p) },
              { v: tr.within ? `${d2(tr.within.or)} · ${p3(tr.within.p)}` : '–' },
              { v: tr.without_one ? `${r.pitchers.find((p) => p.id === tr.without_one!.pitcher_id)?.name ?? tr.without_one.pitcher_id} · ${p3(tr.without_one.p)}` : '–' },
            ],
          }))}
      />

      <h2>{t.other}</h2>
      <h3>{t.pitchTypes}</h3>
      <Grid
        head={[t.pitchTypeCols.type, t.pitchTypeCols.pitches, t.pitchTypeCols.velo, t.pitchTypeCols.swing, t.pitchTypeCols.whiff, t.pitchTypeCols.chase, t.pitchTypeCols.bip, t.pitchTypeCols.hits]}
        rows={r.pitch_types.map((p) => ({
          label: typeNames[p.code] ?? p.code,
          cells: [
            rate(p.pitches, s.pitches),
            p.velo_avg === null ? { v: '–' } : { v: formatStat(p.velo_avg, 'dec1'), n: String(p.velo_n) },
            rate(p.swings, p.pitches),
            rate(p.whiffs, p.swings),
            rate(p.chase_swings, p.chase_pitches),
            plain(p.bip),
            rate(p.hits, p.bip),
          ],
        }))}
      />

      <h3>{t.counts}</h3>
      <Grid
        head={[t.countCols.key, t.countCols.pitches, t.countCols.swing, t.countCols.whiff, t.countCols.zoneSwing, t.countCols.chase, t.countCols.called]}
        rows={r.counts.map((c) => ({
          label: t.countKeys[c.key] ?? c.key,
          cells: [plain(c.pitches), rate(c.swings, c.pitches), rate(c.whiffs, c.swings), rate(c.zone_swings, c.zone_pitches), rate(c.chase_swings, c.chase_pitches), rate(c.called, c.pitches)],
        }))}
      />

      <h3>{t.platoon}</h3>
      <Grid
        head={['', t.rows.pa, t.rows.avg, t.rows.obp, t.rows.slg, t.rows.ops, t.rows.swing, t.rows.whiff, t.rows.chase]}
        rows={r.platoon.map((p) => ({
          label: t.platoonKeys[p.key] ?? p.key,
          cells: [plain(p.pa), withPa(p.avg, 'avg', p.ab), withPa(p.obp, 'avg', p.pa), withPa(p.slg, 'avg', p.ab), withPa(p.ops, 'avg', p.pa), rate(p.swings, p.pitches), rate(p.whiffs, p.swings), rate(p.chase_swings, p.chase_pitches)],
        }))}
      />

      <h3>{t.contactTitle}</h3>
      <Grid
        head={['', t.rows.bip, t.rows.hitRate, t.rows.tbPerBip]}
        rows={r.contact.map((c) => ({
          label: t.contactKeys[c.key] ?? c.key,
          cells: [plain(c.bip), rate(c.hits, c.bip), c.bip ? { v: formatStat(c.tb / c.bip, 'avg'), n: String(c.bip) } : { v: '–' }],
        }))}
      />

      {r.fatigue && (
        <>
          <h3>{t.fatigue}</h3>
          <p className="muted small">{t.fatigueNote}</p>
          <Grid
            head={[t.fatigueCols.range, t.fatigueCols.n, t.fatigueCols.velo, t.fatigueCols.rel]}
            rows={r.fatigue.by_number.map((b) => ({
              label: t.pitchRange(b.from, b.to),
              cells: [plain(b.n), { v: formatStat(b.velo_avg, 'dec1'), n: String(b.n) }, { v: `${b.velo_rel > 0 ? '+' : ''}${b.velo_rel.toFixed(1)}`, n: String(b.n) }],
            }))}
          />
        </>
      )}

      <h2>{t.caveats}</h2>
      <ul>
        {t.caveatList.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </main>
  );
}

