export const SHARED_PASSPHRASE_MIN_LENGTH = 12;

export function isSharedPassphraseValid(passphrase: string): boolean {
  return passphrase.length >= SHARED_PASSPHRASE_MIN_LENGTH;
}
