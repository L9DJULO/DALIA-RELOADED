import React from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import useDraftStore, { useStudioStore } from '../../stores/draftStore';
import useChampionsStore from '../../stores/championsStore';
import { DraftContext } from '../../stores/draftContext';
import Topbar from '../Topbar';
import WhyPanel from './WhyPanel';

const syndra = { id: 134, key: 'Syndra', name: 'Syndra', roles: ['mid'] };
const rec = { champion_id: 134, champion_key: 'Syndra', champion_name: 'Syndra', total_score: 1.2, score_sd: 1, breakdown: { terms: [] } };

beforeEach(() => {
  useDraftStore.getState().resetDraft('live');
  useStudioStore.getState().resetDraft('manual');
  useChampionsStore.setState({ champions: [syndra], byId: { 134: syndra }, loaded: true, loading: false, error: null });
});
afterEach(() => cleanup());

it('does not ask for the side in the automatic draft, only in the Studio', () => {
  render(<Topbar page="draft" onPage={() => {}}/>);
  expect(screen.queryByRole('group', { name: 'Mon équipe' })).toBeNull();
  expect(screen.getByRole('button', { name: /Mon rôle/ })).toBeTruthy();
  cleanup();
  render(<Topbar page="studio" onPage={() => {}}/>);
  expect(screen.getByRole('group', { name: 'Mon équipe' })).toBeTruthy();
});

it('compares the selected pick with one other champion in the automatic draft', () => {
  useDraftStore.setState({ recommendations: [rec] });
  render(<WhyPanel selected={0}/>);
  expect(screen.getByText('Comparer Syndra avec un autre champion')).toBeTruthy();
  expect(screen.queryByText('Comparer deux champions')).toBeNull();
});

it('compares any two champions in the Studio', () => {
  render(<DraftContext.Provider value={useStudioStore}><WhyPanel selected={0}/></DraftContext.Provider>);
  expect(screen.getByText('Comparer deux champions')).toBeTruthy();
});
