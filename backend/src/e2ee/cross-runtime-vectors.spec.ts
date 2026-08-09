import { hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Encoder } from 'cbor-x';
import sodium from 'libsodium-wrappers-sumo';

const vectors = JSON.parse(readFileSync(
  join(process.cwd(), '..', 'docs', 'security', 'e2ee-v1-key-vectors.json'),
  'utf8',
));
const encoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });
const fromHex = (value: string) => Buffer.from(value, 'hex');
const uuid = (value: string) => fromHex(value.replaceAll('-', ''));

describe('Node reference validation of browser key vectors', () => {
  beforeAll(async () => sodium.ready);

  it('reproduces RFC 5869 and the complete ElderFlow recovery wrapper bytes', () => {
    const primitive = vectors.rfc5869Sha256Case1;
    expect(Buffer.from(hkdfSync(
      'sha256',
      fromHex(primitive.inputKeyMaterialHex),
      fromHex(primitive.saltHex),
      fromHex(primitive.infoHex),
      32,
    )).toString('hex')).toBe(primitive.outputHex);

    const vector = vectors.recoveryWrapper;
    const organizationId = uuid(vector.organizationId);
    const slotId = uuid(vector.slotId);
    const nonce = fromHex(vector.nonceHex);
    const header = [organizationId, slotId, uuid(vector.orkId), 1, nonce];
    const info = Buffer.from(encoder.encode(['ElderFlow key v1', 3, 0, slotId]));
    const derivedKey = Buffer.from(hkdfSync(
      'sha256',
      fromHex(vector.recoverySecretHex),
      organizationId,
      info,
      32,
    ));
    const associatedData = Buffer.from(encoder.encode([1, 2, 1, header]));
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      fromHex(vector.organizationRootKeyHex),
      Uint8Array.from(associatedData),
      null,
      nonce,
      derivedKey,
      'uint8array',
    );
    const envelope = Buffer.from(encoder.encode([1, 2, 1, header, ciphertext, null]));

    expect(info.toString('hex')).toBe(vector.hkdfInfoCborHex);
    expect(derivedKey.toString('hex')).toBe(vector.derivedKeyHex);
    expect(associatedData.toString('hex')).toBe(vector.associatedDataCborHex);
    expect(Buffer.from(ciphertext).toString('hex')).toBe(vector.ciphertextHex);
    expect(envelope.toString('hex')).toBe(vector.envelopeHex);
  });

  it('reproduces the unchanged RFC 8032 Ed25519 vector', () => {
    const vector = vectors.rfc8032Ed25519Case1;
    const keyPair = sodium.crypto_sign_seed_keypair(fromHex(vector.seedHex), 'uint8array');
    const signature = sodium.crypto_sign_detached(fromHex(vector.messageHex), keyPair.privateKey, 'uint8array');

    expect(Buffer.from(keyPair.publicKey).toString('hex')).toBe(vector.publicKeyHex);
    expect(Buffer.from(signature).toString('hex')).toBe(vector.signatureHex);
  });

  it('reproduces the approved Argon2id profile, shared slot, OCK wrapper, and independent epoch nonces', () => {
    const shared = vectors.sharedPassphraseWrapper;
    const organizationId = uuid(shared.organizationId);
    const slotId = uuid(shared.slotId);
    const salt = fromHex(shared.saltHex);
    const nonce = fromHex(shared.nonceHex);
    const argonOutput = Buffer.from(sodium.crypto_pwhash(
      32,
      shared.passphraseUtf8,
      salt,
      shared.operationsLimit,
      shared.memoryLimit,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
      'uint8array',
    ));
    const info = Buffer.from(encoder.encode(['ElderFlow key v1', 2, 0, slotId]));
    const key = Buffer.from(hkdfSync('sha256', argonOutput, organizationId, info, 32));
    const header = [organizationId, slotId, uuid(shared.orkId), 1, 3, 67_108_864, salt, nonce];
    const associatedData = Buffer.from(encoder.encode([1, 1, 1, header]));
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      fromHex(shared.organizationRootKeyHex), Uint8Array.from(associatedData), null, nonce, key, 'uint8array',
    );
    const envelope = Buffer.from(encoder.encode([1, 1, 1, header, ciphertext, null]));

    expect(argonOutput.toString('hex')).toBe(shared.argon2idOutputHex);
    expect(info.toString('hex')).toBe(shared.hkdfInfoCborHex);
    expect(key.toString('hex')).toBe(shared.derivedKeyHex);
    expect(associatedData.toString('hex')).toBe(shared.associatedDataCborHex);
    expect(Buffer.from(ciphertext).toString('hex')).toBe(shared.ciphertextHex);
    expect(envelope.toString('hex')).toBe(shared.envelopeHex);

    const content = vectors.contentKeyWrapper;
    const contentNonce = fromHex(content.nonceHex);
    const contentInfo = Buffer.from(encoder.encode(['ElderFlow key v1', 1, 0, uuid(content.ockId)]));
    const contentKey = Buffer.from(hkdfSync(
      'sha256', fromHex(content.organizationRootKeyHex), uuid(content.organizationId), contentInfo, 32,
    ));
    const contentHeader = [uuid(content.organizationId), uuid(content.orkId), uuid(content.ockId), 1, contentNonce];
    const contentAad = Buffer.from(encoder.encode([1, 3, 1, contentHeader]));
    const contentCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      fromHex(content.organizationContentKeyHex), Uint8Array.from(contentAad), null, contentNonce, contentKey, 'uint8array',
    );
    const contentEnvelope = Buffer.from(encoder.encode([1, 3, 1, contentHeader, contentCiphertext, null]));

    expect(contentInfo.toString('hex')).toBe(content.hkdfInfoCborHex);
    expect(contentKey.toString('hex')).toBe(content.derivedKeyHex);
    expect(contentAad.toString('hex')).toBe(content.associatedDataCborHex);
    expect(Buffer.from(contentCiphertext).toString('hex')).toBe(content.ciphertextHex);
    expect(contentEnvelope.toString('hex')).toBe(content.envelopeHex);

    const epochs = vectors.clientEpochNonces;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(epochs.counter));
    expect(Buffer.concat([fromHex(epochs.firstPrefixHex), counter]).toString('hex')).toBe(epochs.firstNonceHex);
    expect(Buffer.concat([fromHex(epochs.secondPrefixHex), counter]).toString('hex')).toBe(epochs.secondNonceHex);
    expect(epochs.firstNonceHex).not.toBe(epochs.secondNonceHex);
  });
});
