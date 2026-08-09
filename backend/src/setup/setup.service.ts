import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { InstallationSettings } from '../installation/installation-settings.entity';
import { SupportedLanguage } from '../installation/language';
import { User } from '../users/user.entity';
import { CreateInitialUserDto } from './dto/setup.dto';
import { codedHttpException } from '../errors/coded-http.exception';
import { E2eeKeyState } from '../e2ee/e2ee-key-state.entity';
import { validateKeyEnvelope } from '../e2ee/envelope-validator';

export const SETUP_PASSWORD_HASH = Symbol('SETUP_PASSWORD_HASH');

@Injectable()
export class SetupService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SETUP_PASSWORD_HASH)
    private readonly setupPasswordHash: string,
  ) {}

  async installation(): Promise<{ setupRequired: boolean; defaultLanguage: SupportedLanguage | null }> {
    const [userCount, settingsCount, keyStateCount] = await Promise.all([
      this.dataSource.getRepository(User).count(),
      this.dataSource.getRepository(InstallationSettings).count(),
      this.dataSource.getRepository(E2eeKeyState).count(),
    ]);
    if (new Set([userCount === 0, settingsCount === 0, keyStateCount === 0]).size !== 1) {
      throw codedHttpException(HttpStatus.CONFLICT, 'INSTALLATION_STATE_INCONSISTENT', 'Installation state is inconsistent');
    }
    if (userCount === 0) return { setupRequired: true, defaultLanguage: null };
    const settings = await this.dataSource.getRepository(InstallationSettings).findOne({ where: { id: 1 } });
    if (!settings) throw codedHttpException(HttpStatus.CONFLICT, 'INSTALLATION_STATE_INCONSISTENT', 'Installation state is inconsistent');
    return { setupRequired: false, defaultLanguage: settings.defaultLanguage };
  }

  async verifyPassword(candidate: string): Promise<{ valid: true }> {
    await this.ensureSetupRequired();
    if (!(await this.passwordMatches(candidate))) {
      throw codedHttpException(HttpStatus.UNAUTHORIZED, 'SETUP_PASSWORD_INVALID', 'Invalid setup password');
    }
    return { valid: true };
  }

  async createInitialUser(input: CreateInitialUserDto): Promise<User> {
    if (!(await this.passwordMatches(input.setupPassword))) {
      throw codedHttpException(HttpStatus.UNAUTHORIZED, 'SETUP_PASSWORD_INVALID', 'Invalid setup password');
    }

    const passwordHash = await hash(input.password, 12);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
      const userCount = await manager.count(User);
      const settingsCount = await manager.count(InstallationSettings);
      const keyStateCount = await manager.count(E2eeKeyState);
      if (userCount || settingsCount || keyStateCount) {
        if (new Set([userCount === 0, settingsCount === 0, keyStateCount === 0]).size !== 1) {
          throw codedHttpException(HttpStatus.CONFLICT, 'INSTALLATION_STATE_INCONSISTENT', 'Installation state is inconsistent');
        }
        throw codedHttpException(HttpStatus.CONFLICT, 'INSTALLATION_ALREADY_CONFIGURED', 'System already setup');
      }

      const settings = manager.create(InstallationSettings, {
        id: 1,
        defaultLanguage: input.defaultLanguage,
      });
      await manager.save(InstallationSettings, settings);

      const user = manager.create(User, {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        role: 'superadmin',
      });
      const saved = await manager.save(User, user);
      const keyState = manager.create(E2eeKeyState, {
        id: 1,
        organizationId: input.e2ee.organizationId,
        generation: 1,
        orkId: input.e2ee.orkId,
        ockId: input.e2ee.ockId,
        ockEpoch: 1,
        sharedPassphraseSlot: this.decodeEnvelope(input.e2ee.sharedPassphraseSlot),
        recoverySlot: this.decodeEnvelope(input.e2ee.recoverySlot),
        contentKeyWrapper: this.decodeEnvelope(input.e2ee.contentKeyWrapper),
        custodyAcknowledgedBy: saved.id,
        custodyAcknowledgedAt: new Date(),
      });
      const sharedMetadata = validateKeyEnvelope(keyState.sharedPassphraseSlot, 1);
      const recoveryMetadata = validateKeyEnvelope(keyState.recoverySlot, 2);
      const contentMetadata = validateKeyEnvelope(keyState.contentKeyWrapper, 3);
      if (sharedMetadata.organizationId !== input.e2ee.organizationId
        || recoveryMetadata.organizationId !== input.e2ee.organizationId
        || contentMetadata.organizationId !== input.e2ee.organizationId
        || sharedMetadata.wrappedKeyId !== input.e2ee.orkId
        || recoveryMetadata.wrappedKeyId !== input.e2ee.orkId
        || contentMetadata.primaryKeyId !== input.e2ee.orkId
        || contentMetadata.wrappedKeyId !== input.e2ee.ockId) {
        throw codedHttpException(HttpStatus.BAD_REQUEST, 'E2EE_ENVELOPE_CONTEXT_INVALID', 'E2EE envelope context does not match');
      }
      await manager.save(E2eeKeyState, keyState);
      if (input.defaultLanguage === 'de') {
        await this.localizeSeededAgendaSections(manager);
      }
      delete (saved as Partial<User>).passwordHash;
      return saved;
    });
  }

  private decodeEnvelope(value: string): Buffer {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length < 32 || decoded.length > 12_288 || decoded.toString('base64url') !== value) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'E2EE_ENVELOPE_INVALID', 'Invalid E2EE envelope');
    }
    return decoded;
  }

  private async ensureSetupRequired(): Promise<void> {
    if (!(await this.installation()).setupRequired) {
      throw codedHttpException(HttpStatus.CONFLICT, 'INSTALLATION_ALREADY_CONFIGURED', 'System already setup');
    }
  }

  private passwordMatches(candidate: string): Promise<boolean> {
    return compare(candidate, this.setupPasswordHash);
  }

  private async localizeSeededAgendaSections(manager: EntityManager): Promise<void> {
    const translations: Record<string, string> = {
      'Opening / Input': 'Eröffnung / Impuls',
      'Attendance and next meeting': 'Anwesenheit und nächste Sitzung',
      'People in special life circumstances': 'Menschen in besonderen Lebenssituationen',
      'Urgent topics': 'Dringende Themen',
      'Strategic topics': 'Strategische Themen',
      'Communication to the church': 'Informationen an die Gemeinde',
      'Dates and appointments': 'Termine',
      'Other topics': 'Weitere Themen',
    };
    await manager.query('SAVEPOINT localize_seeded_agenda_sections');
    try {
      const sections = await manager.find(AgendaSection);
      const existing = new Set(sections.map(({ name }) => name));
      const unmatched = Object.keys(translations).filter((name) => !existing.has(name));
      if (unmatched.length) {
        throw new Error(`Seeded agenda sections not found: ${unmatched.join(', ')}`);
      }

      await manager.query(`
        UPDATE "agenda_sections"
        SET "name" = CASE "name"
          ${Object.entries(translations).map(([english, german]) => `WHEN '${english.replaceAll("'", "''")}' THEN '${german.replaceAll("'", "''")}'`).join('\n          ')}
          ELSE "name"
        END
        WHERE "name" IN (${Object.keys(translations).map((name) => `'${name.replaceAll("'", "''")}'`).join(', ')})
      `);
      await manager.query('RELEASE SAVEPOINT localize_seeded_agenda_sections');
    } catch (error) {
      await manager.query('ROLLBACK TO SAVEPOINT localize_seeded_agenda_sections');
      throw error;
    }
  }
}
