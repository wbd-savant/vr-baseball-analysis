// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PitchRow } from './engine';
import { RowEditor } from './parts';
import { People } from './people';

afterEach(cleanup);

const schema = { game_id: { type: 'string' }, pitch_id: { type: 'integer' }, batter_id: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] } };
const people = new People([{ player_id: 'hiki-king', vrchat_name: 'Hiki King', display_name: '' }], [], []);
const row = { game_id: 'g', pitch_id: 1, batter_id: 'x', notes: null } as unknown as PitchRow;

function edit(batter: string) {
  const onSave = vi.fn();
  render(<RowEditor row={row} schema={schema} people={people} onSave={onSave} onCancel={() => {}} />);
  fireEvent.change(screen.getAllByRole('textbox')[2], { target: { value: batter } });
  fireEvent.click(screen.getByRole('button', { name: 'Save row' }));
  return onSave;
}

describe('row editor', () => {
  it('saves a typed VRChat name as the player_id', () => {
    expect(edit('Hiki King')).toHaveBeenCalledWith(expect.objectContaining({ batter_id: 'hiki-king' }));
  });

  it('refuses a name nobody has', () => {
    expect(edit('Nobody Here')).not.toHaveBeenCalled();
    expect(screen.getByText(/is not a known player/)).toBeTruthy();
  });
});
