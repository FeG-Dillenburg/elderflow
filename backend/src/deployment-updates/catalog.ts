import manifest from './manifest.json';

export const announcementCategories = ['feature', 'improvement', 'bugfix'] as const;
export interface ManifestEntry {
  id: string;
  category: typeof announcementCategories[number];
}

export function validateManifest(input: unknown): ManifestEntry[] {
  if (!Array.isArray(input)) throw new Error('Deployment announcement manifest must be an array');
  const identifiers = new Set<string>();
  return input.map((entry: ManifestEntry) => {
    if (!entry || typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]{0,99}$/.test(entry.id)
      || !announcementCategories.includes(entry.category)) {
      throw new Error('Invalid deployment announcement identifier or category');
    }
    if (identifiers.has(entry.id)) throw new Error(`Duplicate deployment announcement: ${entry.id}`);
    identifiers.add(entry.id);
    return { id: entry.id, category: entry.category };
  });
}

export const announcementManifest = validateManifest(manifest);
