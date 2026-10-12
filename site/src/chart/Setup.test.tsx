// @vitest-environment jsdom
// Lineup editing in the setup screen, from a lineup that lists a player twice (the double-switch bug).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Draft, ServerData } from './data';
import { Setup } from './Setup';

afterEach(cleanup);

const names: Record<string, string> = {
  summer030: 'summer030', 'ma-wang': 'Ma-Wang', pli: '플리 PLI', beberrying: 'beberrying', hadia: '하디아_',
  yun: '윤이제_블리즈', kyurang: '큐랑513', waangi: '와앙이', pporingeol: '뽀린걸_', away1: 'Away One',
};
const data = {
  players: Object.entries(names).map(([player_id, vrchat_name]) => ({ player_id, vrchat_name, display_name: '' })),
  aliases: [], teams: [], rosters: [], games: [], pitchTypes: [], pitchSchema: {}, pitchFiles: [],
} as unknown as ServerData;

const draft = {
  game: { game_id: 'g', season: 's', date: null, label: null, home_team_id: 'h', away_team_id: 'a', home_final: null, away_final: null, vod_url: null, charted_by: null, chart_status: 'partial', velo_unit: 'km/h', game_version: null },
  pitchTypesShown: 'yes', pitchTypesFromInning: null, lite: false, dh: false, newPlayers: [], newTeams: [],
  lineups: {
    away: { order: ['away1'], pitcher: 'away1', catcher: null, fielders: {}, dh: null },
    home: {
      order: ['summer030', 'ma-wang', 'pli', 'beberrying', 'hadia', 'ma-wang', 'yun', 'kyurang', 'waangi'],
      pitcher: 'pporingeol', catcher: 'yun',
      fielders: { 3: 'kyurang', 4: 'summer030', 5: 'hadia', 6: 'beberrying', 7: 'waangi', 8: 'ma-wang', 9: 'pli' },
      dh: null,
    },
  },
} as unknown as Draft;

const home = () => screen.getByRole('heading', { name: 'Home lineup' }).closest('section')!;
const order = () => within(home()).getAllByRole('listitem').map((li) => li.querySelector('span')!.textContent);

describe('setup lineup editor', () => {
  it('removes one of two spots for the same player, adds the new pitcher and moves her up', async () => {
    const onDone = vi.fn();
    render(<Setup data={data} draft={draft} takenIds={new Set()} onDone={onDone} onCancel={() => {}} />);
    fireEvent.click(within(home()).getAllByRole('button', { name: 'remove' })[5]);
    expect(order()).toEqual(['summer030', 'Ma-Wang', '플리 PLI', 'beberrying', '하디아_', '윤이제_블리즈', '큐랑513', '와앙이']);
    // Ma-Wang keeps center field after the extra spot is removed.
    expect((within(home()).getAllByRole('listitem')[1].querySelector('select') as HTMLSelectElement).value).toBe('8');

    const add = within(home()).getByPlaceholderText('Add batter (VRChat name)');
    fireEvent.change(add, { target: { value: '뽀린걸_' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    await within(home()).findByText('뽀린걸_', { selector: 'li span' });
    for (let i = 0; i < 3; i++) {
      const items = within(home()).getAllByRole('listitem');
      const row = items.find((li) => li.querySelector('span')!.textContent === '뽀린걸_')!;
      fireEvent.click(within(row).getByRole('button', { name: 'move up' }));
    }
    expect(order()).toEqual(['summer030', 'Ma-Wang', '플리 PLI', 'beberrying', '하디아_', '뽀린걸_', '윤이제_블리즈', '큐랑513', '와앙이']);

    // What the tool keeps, not just what the screen shows (duplicate keys once made the two differ).
    vi.spyOn(window, 'confirm').mockReturnValue(true); // the away side's defense is incomplete
    fireEvent.click(screen.getByRole('button', { name: 'Save setup' }));
    const saved = onDone.mock.calls[0][0].lineups.home;
    expect(saved.order).toEqual(['summer030', 'ma-wang', 'pli', 'beberrying', 'hadia', 'pporingeol', 'yun', 'kyurang', 'waangi']);
    expect([saved.pitcher, saved.fielders[8]]).toEqual(['pporingeol', 'ma-wang']);
  });
});
