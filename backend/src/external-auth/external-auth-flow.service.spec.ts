import { HttpStatus } from '@nestjs/common';
import { codedHttpException } from '../errors/coded-http.exception';
import { ExternalAuthFlowService } from './external-auth-flow.service';

describe('ExternalAuthFlowService provider diagnostics', () => {
  it('allows only safe provider request context into the transaction log', () => {
    const service = new ExternalAuthFlowService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const error = codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_TOKEN_CONNECTION_FAILED', 'sensitive message', {
      authorization: 'Bearer secret',
      endpoint: 'https://user:password@provider.example/oauth/token?code=secret#fragment',
      httpStatus: 502,
      method: 'POST',
      networkCode: 'ECONNRESET',
      responseBody: 'sensitive body',
      resolvedAddress: '203.0.113.8',
      resolvedFamily: 4,
      stage: 'token',
    });

    expect((service as any).providerDiagnostic(error)).toEqual({
      endpoint: 'https://provider.example/oauth/token',
      httpStatus: 502,
      method: 'POST',
      networkCode: 'ECONNRESET',
      resolvedAddress: '203.0.113.8',
      resolvedFamily: 4,
      stage: 'token',
    });
  });
});
