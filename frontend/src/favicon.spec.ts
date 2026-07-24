import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document metadata', () => {
  it('uses the Elderflow logo as its favicon', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" href="/elderflow-logo.svg" />',
    );
  });
});
