import { describe, expect, it } from 'vitest';
import de from './messages/de';
import en from './messages/en';

const keys = (value: Record<string, unknown>, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === 'object' && !Array.isArray(child)
    ? keys(child as Record<string, unknown>, path)
    : [path];
});

describe('translation catalogs', () => {
  it('keeps German in exact parity with the canonical English key schema', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });
});
