import { announcementManifest, validateManifest } from './catalog';

describe('Packaged deployment announcement manifest', () => {
  it('ships the initial feature and accepts all supported categories', () => {
    expect(announcementManifest).toEqual(expect.arrayContaining([
      { id: 'deployment-updates-dialog', category: 'feature' },
    ]));
    expect(validateManifest([{ id: 'fix', category: 'bugfix' }, { id: 'improve', category: 'improvement' }])).toHaveLength(2);
  });

  it.each([null, {}, [null], [{ id: 'bad id', category: 'feature' }],
    [{ id: 'valid', category: 'unknown' }], [{ id: 'same', category: 'feature' }, { id: 'same', category: 'bugfix' }]].map((manifest) => [manifest]))(
    'rejects malformed or duplicate entries', (manifest) => {
      expect(() => validateManifest(manifest)).toThrow();
    },
  );
});
