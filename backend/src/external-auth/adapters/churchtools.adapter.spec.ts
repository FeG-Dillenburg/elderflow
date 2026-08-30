import { ChurchToolsAdapter } from './churchtools.adapter';
import contract from './fixtures/churchtools-userinfo.contract.json';

describe('ChurchToolsAdapter contract', () => {
  const http = { postForm: jest.fn(), getJson: jest.fn() };
  const urls = { assertSafe: jest.fn() };
  const adapter = new ChurchToolsAdapter(http as any, urls as any);
  const provider = { churchToolsUrl: 'https://example.church.tools', clientId: 'client-id', publicBaseUrl: 'https://elderflow.example.com' } as any;
  const transaction = { codeVerifier: 'verifier' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('uses the documented endpoints, sends no scope or secret, and treats id as the stable subject', async () => {
    http.postForm.mockResolvedValue({ access_token: 'transient-token', token_type: 'Bearer' });
    http.getJson.mockResolvedValue(contract.response);

    await expect(adapter.exchange(provider, transaction, { code: 'authorization-code' })).resolves.toEqual({
      subject: '4711', email: 'user@example.com',
    });
    const form = http.postForm.mock.calls[0][1] as URLSearchParams;
    expect(http.postForm.mock.calls[0][0]).toBe('https://example.church.tools/oauth/access_token');
    expect(http.getJson).toHaveBeenCalledWith('https://example.church.tools/oauth/userinfo', 'Bearer transient-token');
    expect(form.has('scope')).toBe(false);
    expect(form.has('client_secret')).toBe(false);
  });

  it('prefers root identity fields over the duplicated data object', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({
      ...contract.response,
      id: 815,
      email: 'root@example.com',
      data: { ...contract.response.data, id: 4711, email: 'nested@example.com' },
    });

    await expect(adapter.exchange(provider, transaction, { code: 'code' })).resolves.toEqual({
      subject: '815', email: 'root@example.com',
    });
  });

  it('falls back to the data object when root identity fields are missing or invalid', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({ id: null, email: '', data: contract.response.data });

    await expect(adapter.exchange(provider, transaction, { code: 'code' })).resolves.toEqual({
      subject: '4711', email: 'user@example.com',
    });
  });

  it('rejects email-only profiles because email is not a stable identity', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({ email: 'user@example.com', data: { email: 'nested@example.com' } });
    await expect(adapter.exchange(provider, transaction, { code: 'code' })).rejects.toThrow('Provider identity response is invalid');
  });
});
