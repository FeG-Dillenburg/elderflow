import type { IncomingMessage } from 'node:http';
import { E2EE_MEDIA_TYPE, isE2eeMediaType } from './e2ee-protocol';

function requestWithContentType(contentType?: string): IncomingMessage {
  return {
    headers: contentType === undefined ? {} : { 'content-type': contentType },
  } as IncomingMessage;
}

describe('E2EE protocol media type', () => {
  it('matches the required versioned media type for raw-body parsing', () => {
    expect(isE2eeMediaType(requestWithContentType(E2EE_MEDIA_TYPE))).toBe(true);
    expect(isE2eeMediaType(requestWithContentType(
      'Application/Vnd.Elderflow.E2ee+Cbor; V=1',
    ))).toBe(true);
  });

  it('rejects unversioned, unsupported, and unrelated media types', () => {
    expect(isE2eeMediaType(requestWithContentType(
      'application/vnd.elderflow.e2ee+cbor',
    ))).toBe(false);
    expect(isE2eeMediaType(requestWithContentType(
      'application/vnd.elderflow.e2ee+cbor;v=2',
    ))).toBe(false);
    expect(isE2eeMediaType(requestWithContentType('application/cbor'))).toBe(false);
    expect(isE2eeMediaType(requestWithContentType())).toBe(false);
  });
});
