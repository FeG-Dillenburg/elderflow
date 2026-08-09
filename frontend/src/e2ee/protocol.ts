export const E2EE_MEDIA_TYPE = 'application/vnd.elderflow.e2ee+cbor;v=1';

export const PASSPHRASE_KDF = Object.freeze({
  version: 1,
  operationsLimit: 3,
  memoryLimit: 67_108_864,
  outputLength: 32,
});

export function bytesToBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('E2EE_BASE64_INVALID');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
