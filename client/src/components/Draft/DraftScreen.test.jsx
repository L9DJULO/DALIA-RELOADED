import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useDraftStore from '../../stores/draftStore';
import useChampionsStore from '../../stores/championsStore';
import DraftScreen from './DraftScreen';
import ChampionSearch from './ChampionSearch';

const syndra = { id: 134, key: 'Syndra', name: 'Syndra', roles: ['mid'] };

beforeEach(() => {
  useDraftStore.getState().resetDraft('manual');
  useChampionsStore.setState({ champions: [syndra], byId: { 134: syndra }, loaded: true, loading: false, error: null });
});
afterEach(() => cleanup());

// In the app React closes the dialog before the key event reaches `window`, so an Enter
// that picked a champion also looked like "Enter with nothing focused" and launched the analysis.
it('keeps its keys to itself so picking with Enter launches nothing else', async () => {
  const onSelect = vi.fn();
  const reachedWindow = [];
  const spy = e => reachedWindow.push(e.key);
  window.addEventListener('keydown', spy);
  const user = userEvent.setup();
  render(<ChampionSearch title="red P1" unavailable={new Set()} onSelect={onSelect} onClose={() => {}}/>);
  await user.keyboard('syn{ArrowDown}{Enter}');
  window.removeEventListener('keydown', spy);
  expect(onSelect).toHaveBeenCalledWith(syndra);
  expect(reachedWindow).not.toContain('Enter');
  expect(reachedWindow).not.toContain('ArrowDown');
});

it('closes on Escape without the key reaching the rest of the app', async () => {
  const onClose = vi.fn();
  const reachedWindow = [];
  const spy = e => reachedWindow.push(e.key);
  window.addEventListener('keydown', spy);
  const user = userEvent.setup();
  render(<ChampionSearch title="red P1" unavailable={new Set()} onSelect={() => {}} onClose={onClose}/>);
  await user.keyboard('{Escape}');
  window.removeEventListener('keydown', spy);
  expect(onClose).toHaveBeenCalled();
  expect(reachedWindow).not.toContain('Escape');
});

it('edits a slot from the strip with the keyboard', async () => {
  const analyse = vi.fn();
  useDraftStore.setState({ getRecommendations: analyse });
  const user = userEvent.setup();
  render(<DraftScreen/>);
  await user.click(screen.getByRole('button', { name: 'red P1 : vide' }));
  await user.keyboard('syn{Enter}');
  expect(screen.getByRole('button', { name: 'red P1 : Syndra' })).toBeTruthy();
  expect(analyse).not.toHaveBeenCalled();
});

it('launches the analysis with Enter when nothing has the focus', async () => {
  const analyse = vi.fn();
  useDraftStore.setState({ getRecommendations: analyse });
  const user = userEvent.setup();
  render(<DraftScreen/>);
  await user.keyboard('{Enter}');
  expect(analyse).toHaveBeenCalledTimes(1);
});
