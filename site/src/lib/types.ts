// Shapes of the JSON files written by pipeline/export_json.py.

import type { PitchRec } from './charts';

export type Hand = 'L' | 'R' | 'S' | null;
export type Role = 'batting' | 'pitching';
/** A stat line: counts and rates keyed by stat id (see pipeline/build_stats.py). */
export type Line = Record<string, number | string | null>;

export interface Person {
  id: string;
  slug: string;
  name: string;
  vrchat_name: string;
  romanized: string;
  bats: Hand;
  throws: Hand;
}

export interface PlayerIndexRow extends Person {
  season: string;
  team_ids: string[];
  batting: Line | null;
  pitching: Line | null;
}

export interface Split extends Line {
  key: string;
}

/** Percentile ranks among qualified players of the season (detailed games only). */
export interface Percentiles {
  pool: number;
  qualified: boolean;
  stats: { key: string; value: number | null; den: number | null; pct: number | null }[];
}

export interface SeasonLine {
  season: string;
  team_ids: string[];
  batting: Line | null;
  pitching: Line | null;
  splits: { batting: Split[]; pitching: Split[] };
  percentiles: { batting: Percentiles | null; pitching: Percentiles | null };
}

export interface GameRef {
  game_id: string;
  season: string;
  date: string | null;
  label: string | null;
}

export interface GameLogRow extends GameRef {
  opponent: string;
  [stat: string]: number | string | null | string[];
}

/** Coach's notes from data/raw/swot/{player_id}.md; each section is a list of points. */
export interface Swot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface PlayerFile {
  player: Person;
  swot: Swot | null;
  seasons: SeasonLine[];
  game_log: { batting: GameLogRow[]; pitching: GameLogRow[] };
  /** Pitch-level rows from detailed games only, for the charts. */
  pitches: { as_batter: PitchRec[]; as_pitcher: PitchRec[] };
}

export interface Team {
  team_id: string;
  name: string;
  rosters: Record<string, string[]>;
}

export interface GameSummary extends GameRef {
  home_team_id: string;
  away_team_id: string;
  chart_status: 'partial' | 'complete';
  pitches: number;
  /** Charted in the charting tool (all fields), as opposed to a legacy import. */
  detailed: boolean;
  home_score?: number;
  away_score?: number;
  innings?: number;
}

export interface League {
  seasons: Record<string, { games: number; batting: Line; pitching: Line }>;
  /** Pitch type code -> Korean name, from data/schema/pitch_types.csv. */
  pitch_types: Record<string, string>;
}

/** league/{season}.json: league-wide splits and chart pitches (password only). */
export interface LeagueSeasonFile {
  season: string;
  splits: Split[];
  pitches: PitchRec[];
}

export interface Meta {
  built_at: string;
  seasons: string[];
  /** Seasons with a research report (report/{season}.json). */
  reports?: string[];
  coverage: {
    games: number;
    pitches: number;
    plate_appearances: number;
    games_per_team: Record<string, number>;
    partial_games: string[];
  };
}

/** Plate-discipline counts for a group of pitches (pipeline/research.py). */
export interface DisciplineCounts {
  pitches: number;
  swings: number;
  whiffs: number;
  called: number;
  fouls: number;
  in_play: number;
  located: number;
  zone_pitches: number;
  zone_swings: number;
  zone_whiffs: number;
  chase_pitches: number;
  chase_swings: number;
  chase_whiffs: number;
}

export interface ResultLine {
  pa: number;
  ab: number;
  h: number;
  hr: number;
  bb: number;
  hbp: number;
  k: number;
  tb: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

export interface DirectionCounts {
  bip: number;
  located: number;
  pull: number;
  center: number;
  oppo: number;
  pull_hits: number;
  center_hits: number;
  oppo_hits: number;
  ground: number;
  line: number;
  fly: number;
  popup: number;
  typed: number;
  hits: number;
  hard: number;
  rated: number;
}

export interface Fit {
  or: number;
  lo: number;
  hi: number;
  p: number;
  n: number;
}

export interface Trend extends Fit {
  within: Fit | null;
  without_one: { pitcher_id: string; p: number; or: number; n: number } | null;
}

/** report/{season}.json: research report, password only. */
export interface ReportFile {
  season: string;
  sample: {
    games: number;
    pitches: number;
    velo_pitches: number;
    pa: number;
    bip: number;
    pitchers: number;
    batters: number;
    velo_min: number | null;
    velo_max: number | null;
    velo_median: number | null;
    partial_games: number;
  };
  bands: string[];
  discipline: ({ band: string; velo_avg: number; pitchers: number } & DisciplineCounts)[];
  discipline_all: { velo_avg: number | null; pitchers: number } & DisciplineCounts;
  discipline_fastballs: ({ band: string } & DisciplineCounts)[];
  results: ({ band: string } & ResultLine)[];
  results_all: ResultLine;
  results_by_pitcher_speed: ({ group: number; pitchers: number; lo: number; hi: number } & ResultLine)[];
  direction: ({ band: string } & DirectionCounts)[];
  direction_all: DirectionCounts;
  trends: Record<string, Trend | null>;
  fatigue: {
    slope: number;
    lo: number;
    hi: number;
    p: number;
    n: number;
    outings: number;
    by_number: { from: number; to: number | null; n: number; velo_avg: number; velo_rel: number }[];
  } | null;
  counts: ({ key: string } & DisciplineCounts)[];
  platoon: ({ key: string } & ResultLine & DisciplineCounts)[];
  contact: { key: string; bip: number; hits: number; tb: number }[];
  pitch_types: ({ code: string; fastball: boolean; velo_n: number; velo_avg: number | null; pitchers: number; bip: number; hits: number } & DisciplineCounts)[];
  pitchers: { id: string; name: string; pitches: number; velo_avg: number | null }[];
}
