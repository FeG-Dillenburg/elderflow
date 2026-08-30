import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class ProviderSecretService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const configured = config.get<string>('AUTH_PROVIDER_SECRETS_KEY');
    try {
      const decoded = configured ? Buffer.from(configured, 'base64url') : null;
      this.key = decoded?.length === 32 ? decoded : null;
    } catch {
      this.key = null;
    }
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(value: string): string {
    if (!this.key) throw new Error('AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from('elderflow:external-auth:v1'));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1.${nonce.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
  }

  decrypt(envelope: string): string {
    if (!this.key) throw new Error('AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE');
    try {
      const [version, encodedNonce, encodedCiphertext, encodedTag, extra] = envelope.split('.');
      if (version !== 'v1' || !encodedNonce || !encodedCiphertext || !encodedTag || extra) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(encodedNonce, 'base64url'));
      decipher.setAAD(Buffer.from('elderflow:external-auth:v1'));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('AUTH_PROVIDER_SECRET_DECRYPT_FAILED');
    }
  }
}
