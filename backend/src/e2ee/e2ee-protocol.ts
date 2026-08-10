import type { IncomingMessage } from 'node:http';

export const E2EE_MEDIA_TYPE = 'application/vnd.elderflow.e2ee+cbor;v=1';

export function isE2eeMediaType(request: IncomingMessage): boolean {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string') return false;
  const parts = contentType.split(';').map((part) => part.trim().toLowerCase());
  return parts.length === 2
    && parts[0] === 'application/vnd.elderflow.e2ee+cbor'
    && parts[1] === 'v=1';
}
