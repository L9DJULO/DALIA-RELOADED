import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advantageColor } from '../lib/scores';

// Guards for the Soul Eater design system: every CSS variable a component reads must be
// declared in a stylesheet (an undefined one silently renders transparent or white), and
// the single-red rule leaves no accent switching behind.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = file => fs.readFileSync(file, 'utf8');
const declared = new Set(files.filter(f => f.endsWith('.css'))
  .flatMap(f => [...read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1])));

describe('design system', () => {
  it('declares every CSS variable the interface reads', () => {
    const missing = new Set();
    for (const file of files) {
      for (const [, name] of read(file).matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!declared.has(name)) missing.add(`${name} (${path.relative(SRC, file)})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('never animates every property at once', () => {
    const offenders = files.filter(f => /transition\s*:\s*['"]?all\b/.test(read(f))).map(f => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('keeps red as the only accent', () => {
    const offenders = files.filter(f => /data-accent|dalia_accent|dataset\.accent/.test(read(f))).map(f => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('colours signed advantages with declared tokens', () => {
    expect(advantageColor(1.4)).toBe('var(--ok)');
    expect(advantageColor(-1.4)).toBe('var(--accent-text)');
    expect(advantageColor(0.3)).toBe('var(--bone-2)');
  });
});
