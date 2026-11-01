export function uuidToBytes(value: string): Uint8Array {
  const hex = value.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('E2EE_UUID_INVALID');
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export async function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(inputKeyMaterial), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
