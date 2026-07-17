import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { codedHttpException } from '../errors/coded-http.exception';

interface SessionPayload {
  sub: string;
  exp: number;
}

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  create(userId: string): string {
    const payload: SessionPayload = {
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  verify(token: string): SessionPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_INVALID', 'Invalid session');
    const expected = Buffer.from(this.sign(encoded));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_INVALID', 'Invalid session');
    }
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
      if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_EXPIRED', 'Session expired');
      }
      return payload;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_INVALID', 'Invalid session');
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('AUTH_SESSION_SECRET'))
      .update(value)
      .digest('base64url');
  }
}
