import { describe, expect, it } from 'vitest';
import manifest from '../../../backend/src/deployment-updates/manifest.json';
import de from './messages/de';
import en from './messages/en';

const keys = (value: Record<string, unknown>, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === 'object' && !Array.isArray(child)
    ? keys(child as Record<string, unknown>, path)
    : [path];
});

describe('translation catalogs', () => {
  it('provides English and German text for every deployed announcement and validates its category', () => {
    const identifiers = new Set<string>();
    for (const entry of manifest) {
      expect(['feature', 'improvement', 'bugfix']).toContain(entry.category);
      expect(identifiers.has(entry.id)).toBe(false);
      identifiers.add(entry.id);
      for (const catalog of [en, de]) {
        expect(catalog.deploymentUpdates.entries).toHaveProperty(entry.id);
        expect((catalog.deploymentUpdates.entries as Record<string, string>)[entry.id]?.trim()).toBeTruthy();
      }
    }
  });

  it('keeps German in exact parity with the canonical English key schema', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('uses compact localized feedback for completed Topics', () => {
    expect(en.meetingAgenda.markedDone).toBe('done');
    expect(de.meetingAgenda.markedDone).toBe('erledigt');
  });
});
