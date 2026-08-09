import { E2eeKeyState1720000011000 } from './1720000011000-E2eeKeyState';

describe('E2EE key state migration', () => {
  it('creates content-free key lifecycle tables and a revocable application-session generation', async () => {
    const query = jest.fn();

    await new E2eeKeyState1720000011000().up({ query } as any);

    const statements = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(statements).toContain('"session_version" integer NOT NULL DEFAULT 1');
    expect(statements).toContain('CREATE TABLE "e2ee_key_state"');
    expect(statements).toContain('CREATE TABLE "e2ee_client_epochs"');
    expect(statements).toContain('CREATE TABLE "e2ee_recovery_ceremonies"');
    expect(statements).toContain('CREATE TABLE "e2ee_audit_events"');
    expect(statements).not.toMatch(/passphrase[^_]|recovery_secret|plaintext/i);
  });
});
