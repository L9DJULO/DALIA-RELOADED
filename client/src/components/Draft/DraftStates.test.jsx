import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import useDraftStore from '../../stores/draftStore';
import { StaleBanner } from './DraftStates';

afterEach(() => cleanup());

it('says the new analysis is running instead of offering to relaunch it', () => {
  useDraftStore.setState({ stale: true, loading: true, error: null });
  render(<StaleBanner/>);
  expect(screen.getByText(/La draft a changé : nouvelle analyse en cours/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull();
});

it('announces the automatic refresh while it waits to start', () => {
  useDraftStore.setState({ stale: true, loading: false, error: null });
  render(<StaleBanner/>);
  expect(screen.getByText(/La draft a changé : nouvelle analyse en cours/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull();
});

it('offers to relaunch after a failed analysis', () => {
  useDraftStore.setState({ stale: true, loading: false, error: 'Analyse indisponible' });
  render(<StaleBanner/>);
  expect(screen.getByText(/l'analyse n'a pas abouti/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Relancer' })).toBeTruthy();
});
