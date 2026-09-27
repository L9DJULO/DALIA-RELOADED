import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useDuoStore from '../../stores/duoStore';
import DuoPanel from './DuoPanel';

afterEach(() => cleanup());

it('asks for confirmation before unlinking the duo', async () => {
  const unlink = vi.fn();
  useDuoStore.setState({ linked: true, partner: { username: 'Kaze' }, myCode: 'K7M2QX', loading: false, linking: false, error: null,
    loadDuoState: vi.fn(), unlink });
  const user = userEvent.setup();
  render(<DuoPanel/>);
  await user.click(screen.getByRole('button', { name: 'Délier' }));
  expect(unlink).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Délier Kaze' }));
  expect(unlink).toHaveBeenCalledTimes(1);
});
