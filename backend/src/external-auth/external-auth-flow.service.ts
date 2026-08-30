import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuthService, AuthUser } from '../auth/auth.service';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { configurationFingerprint, safeReturnPath, sha256 } from './external-auth.utils';
import { ExternalIdentityService } from './external-identity.service';
import { ExternalLoginPurpose, ExternalLoginTransaction } from './external-login-transaction.entity';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderSettingsService } from './provider-settings.service';

@Injectable()
export class ExternalAuthFlowService {
  private readonly logger = new Logger(ExternalAuthFlowService.name);

  constructor(
    @InjectRepository(ExternalLoginTransaction) private readonly transactions: Repository<ExternalLoginTransaction>,
    @InjectRepository(ExternalAuthProvider) private readonly providers: Repository<ExternalAuthProvider>,
    private readonly dataSource: DataSource,
    private readonly settings: ProviderSettingsService,
    private readonly registry: ProviderRegistryService,
    private readonly identities: ExternalIdentityService,
    private readonly auth: AuthService,
  ) {}

  async start(purpose: ExternalLoginPurpose, returnPath = '/'): Promise<{ authorizationUrl: string; transactionId: string }> {
    await this.cleanup();
    const provider = await this.settings.requireCurrent(true);
    if (purpose === 'login' && !this.settings.usable(provider)) throw codedHttpException(HttpStatus.SERVICE_UNAVAILABLE, 'AUTH_PROVIDER_UNAVAILABLE', 'External login is unavailable');
    const state = randomBytes(32).toString('base64url');
    const transaction = this.transactions.create({
      providerId: provider.id,
      purpose,
      stateHash: sha256(state),
      codeVerifier: randomBytes(48).toString('base64url'),
      nonce: provider.type === 'oidc' ? randomBytes(32).toString('base64url') : null,
      returnPath: safeReturnPath(returnPath),
      configurationFingerprint: configurationFingerprint(provider),
      completionCodeHash: null,
      completedUserId: null,
      resultCode: null,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      callbackConsumedAt: null,
      completionConsumedAt: null,
    });
    await this.transactions.save(transaction);
    try {
      return { authorizationUrl: await this.registry.for(provider).createAuthorizationUrl(provider, transaction, state), transactionId: transaction.id };
    } catch (error) {
      await this.transactions.delete(transaction.id);
      throw error;
    }
  }

  async callback(state: string | undefined, code: string | undefined, providerError?: string): Promise<string> {
    if (!state) return this.failureRedirect(null, '/');
    const transaction = await this.consumeCallbackState(state).catch(() => null);
    if (!transaction) return this.failureRedirect(null, '/');
    const provider = await this.providers.createQueryBuilder('provider')
      .addSelect('provider.clientSecretEnvelope')
      .where('provider.id = :id', { id: transaction.providerId })
      .andWhere('provider.removed_at IS NULL')
      .getOne();
    if (!provider) return this.failureRedirect(null, transaction.returnPath);
    try {
      if (providerError || !code) throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_PROVIDER_LOGIN_CANCELLED', 'Provider login was cancelled');
      if (transaction.configurationFingerprint !== configurationFingerprint(provider)) throw codedHttpException(HttpStatus.CONFLICT, 'AUTH_PROVIDER_CONFIGURATION_CHANGED', 'Provider configuration changed');
      const identity = await this.registry.for(provider).exchange(provider, transaction, { code });
      if (transaction.purpose === 'test') {
        await this.recordSuccessfulTest(provider.id, transaction);
        return this.testRedirect(provider, transaction.id);
      }
      if (!this.settings.usable(provider)) throw codedHttpException(HttpStatus.SERVICE_UNAVAILABLE, 'AUTH_PROVIDER_UNAVAILABLE', 'External login is unavailable');
      const user = await this.identities.authenticate(provider.id, identity);
      const completionCode = randomBytes(32).toString('base64url');
      transaction.completionCodeHash = sha256(completionCode);
      transaction.completedUserId = user.id;
      transaction.expiresAt = new Date(Date.now() + 5 * 60_000);
      await this.transactions.save(transaction);
      const target = new URL('/auth/external/complete', `${provider.publicBaseUrl}/`);
      target.searchParams.set('code', completionCode);
      target.searchParams.set('return', transaction.returnPath);
      return target.toString();
    } catch (error) {
      const codeValue = this.errorCode(error);
      transaction.resultCode = transaction.purpose === 'test' ? codeValue : 'AUTH_EXTERNAL_LOGIN_FAILED';
      await this.transactions.save(transaction);
      if (transaction.purpose === 'test') {
        this.logger.warn({
          outcome: codeValue,
          providerType: provider.type,
          transactionId: transaction.id,
        });
        await this.recordTestDiagnostic(provider.id, transaction.configurationFingerprint, codeValue);
      }
      return transaction.purpose === 'test' ? this.testRedirect(provider, transaction.id) : this.failureRedirect(provider, transaction.returnPath);
    }
  }

  async complete(code: string): Promise<{ token: string; user: AuthUser }> {
    await this.cleanup();
    const user = await this.dataSource.transaction(async (manager) => {
      const transaction = await manager.getRepository(ExternalLoginTransaction).createQueryBuilder('transaction')
        .setLock('pessimistic_write')
        .where('transaction.completion_code_hash = :hash', { hash: sha256(code) })
        .getOne();
      if (!transaction || !transaction.callbackConsumedAt || transaction.completionConsumedAt || transaction.expiresAt <= new Date() || !transaction.completedUserId) throw this.completionFailure();
      const activeUser = await manager.getRepository(User).createQueryBuilder('user')
        .where('user.id = :id', { id: transaction.completedUserId })
        .andWhere('user.archived_at IS NULL')
        .getOne();
      if (!activeUser) throw this.completionFailure();
      transaction.completionConsumedAt = new Date();
      transaction.completionCodeHash = null;
      await manager.save(ExternalLoginTransaction, transaction);
      return activeUser;
    });
    return this.auth.createSession(user);
  }

  async testResult(id: string): Promise<{ pending: boolean; code: string | null }> {
    const transaction = await this.transactions.findOneBy({ id, purpose: 'test' });
    if (!transaction) throw codedHttpException(HttpStatus.NOT_FOUND, 'AUTH_PROVIDER_TEST_NOT_FOUND', 'Provider test was not found');
    return { pending: !transaction.callbackConsumedAt, code: transaction.resultCode };
  }

  private async consumeCallbackState(state: string): Promise<ExternalLoginTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.getRepository(ExternalLoginTransaction).createQueryBuilder('transaction')
        .setLock('pessimistic_write')
        .where('transaction.state_hash = :hash', { hash: sha256(state) })
        .getOne();
      if (!transaction || transaction.callbackConsumedAt || transaction.expiresAt <= new Date()) throw this.completionFailure();
      transaction.callbackConsumedAt = new Date();
      transaction.stateHash = sha256(randomBytes(32).toString('base64url'));
      return manager.save(ExternalLoginTransaction, transaction);
    });
  }

  private async cleanup(): Promise<void> {
    const table = this.transactions.metadata.tablePath
      .split('.')
      .map((part) => `"${part.replace(/"/g, '""')}"`)
      .join('.');
    await this.dataSource.query(`DELETE FROM ${table} WHERE "id" IN (
      SELECT "id" FROM ${table}
      WHERE "expires_at" < now() OR "completion_consumed_at" IS NOT NULL
      ORDER BY "created_at" ASC LIMIT 100
    )`);
  }

  private async recordSuccessfulTest(providerId: string, transaction: ExternalLoginTransaction): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const provider = await manager.getRepository(ExternalAuthProvider).createQueryBuilder('provider')
        .addSelect('provider.clientSecretEnvelope')
        .setLock('pessimistic_write')
        .where('provider.id = :providerId', { providerId })
        .andWhere('provider.removed_at IS NULL')
        .getOne();
      if (!provider || configurationFingerprint(provider) !== transaction.configurationFingerprint) {
        throw codedHttpException(HttpStatus.CONFLICT, 'AUTH_PROVIDER_CONFIGURATION_CHANGED', 'Provider configuration changed');
      }
      provider.testedFingerprint = transaction.configurationFingerprint;
      provider.testedAt = new Date();
      provider.diagnosticCode = null;
      transaction.resultCode = 'AUTH_PROVIDER_TEST_SUCCEEDED';
      await manager.save(ExternalAuthProvider, provider);
      await manager.save(ExternalLoginTransaction, transaction);
    });
  }

  private async recordTestDiagnostic(providerId: string, fingerprint: string, code: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const provider = await manager.getRepository(ExternalAuthProvider).createQueryBuilder('provider')
        .addSelect('provider.clientSecretEnvelope')
        .setLock('pessimistic_write')
        .where('provider.id = :providerId', { providerId })
        .andWhere('provider.removed_at IS NULL')
        .getOne();
      if (!provider || configurationFingerprint(provider) !== fingerprint) return;
      provider.diagnosticCode = code;
      await manager.save(ExternalAuthProvider, provider);
    });
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response && 'code' in response && typeof response.code === 'string') return response.code;
    }
    return error instanceof Error && /^AUTH_[A-Z0-9_]+$/.test(error.message) ? error.message : 'AUTH_PROVIDER_TEST_FAILED';
  }

  private testRedirect(provider: ExternalAuthProvider, transactionId: string): string {
    const target = new URL('/authentication-settings', `${provider.publicBaseUrl}/`);
    target.searchParams.set('test', transactionId);
    return target.toString();
  }

  private failureRedirect(provider: ExternalAuthProvider | null, returnPath: string): string {
    const target = provider?.publicBaseUrl ? new URL('/login', `${provider.publicBaseUrl}/`) : new URL('http://elderflow.invalid/login');
    target.searchParams.set('externalError', 'AUTH_EXTERNAL_LOGIN_FAILED');
    if (safeReturnPath(returnPath) !== '/') target.searchParams.set('redirect', safeReturnPath(returnPath));
    return provider?.publicBaseUrl ? target.toString() : `${target.pathname}${target.search}`;
  }

  private completionFailure() { return codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_EXTERNAL_CODE_INVALID', 'External login completion code is invalid'); }
}
