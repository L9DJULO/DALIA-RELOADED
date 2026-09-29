import { describe, expect, it } from 'vitest';
import { timerView, pickOrderLabel, remainingAt } from './timer';

describe('timerView', () => {
  it('shows dashes and an empty bar outside champion select', () => {
    expect(timerView({ active: false, remaining: 21 })).toEqual({ text: '--', ratio: 0, danger: false });
  });

  it('shows the remaining seconds and how much of the phase is left', () => {
    expect(timerView({ active: true, remaining: 21.4 })).toEqual({ text: '21', ratio: 0.7, danger: false });
  });

  it('turns urgent at ten seconds', () => {
    expect(timerView({ active: true, remaining: 10 }).danger).toBe(true);
    expect(timerView({ active: true, remaining: 11 }).danger).toBe(false);
  });

  it('pads single digits and never goes negative or past a full bar', () => {
    expect(timerView({ active: true, remaining: 7 }).text).toBe('07');
    expect(timerView({ active: true, remaining: -2 })).toMatchObject({ text: '00', ratio: 0 });
    expect(timerView({ active: true, remaining: 59 }).ratio).toBe(1);
  });
});

describe('remainingAt', () => {
  it('counts down from the moment League last sent the value', () => {
    expect(remainingAt({ remaining: 27, syncedAt: 1000 }, 1000)).toBe(27);
    expect(remainingAt({ remaining: 27, syncedAt: 1000 }, 5500)).toBe(22.5);
  });

  it('stops at zero and falls back to the raw value without a sync time', () => {
    expect(remainingAt({ remaining: 3, syncedAt: 1000 }, 60000)).toBe(0);
    expect(remainingAt({ remaining: 12, syncedAt: 0 }, 60000)).toBe(12);
  });
});

describe('pickOrderLabel', () => {
  it('writes French ordinals', () => {
    expect(pickOrderLabel(1)).toBe('1ᵉʳ PICK');
    expect(pickOrderLabel(4)).toBe('4ᵉ PICK');
  });
});
