import { ConflictException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { InstallationSettings } from '../installation/installation-settings.entity';
import { SupportedLanguage } from '../installation/language';
import { User } from '../users/user.entity';
import { CreateInitialUserDto } from './dto/setup.dto';

export const SETUP_PASSWORD_HASH = Symbol('SETUP_PASSWORD_HASH');

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(SETUP_PASSWORD_HASH)
    private readonly setupPasswordHash: string,
  ) {}

  async installation(): Promise<{ setupRequired: boolean; defaultLanguage: SupportedLanguage | null }> {
    const [userCount, settingsCount] = await Promise.all([
      this.dataSource.getRepository(User).count(),
      this.dataSource.getRepository(InstallationSettings).count(),
    ]);
    if ((userCount === 0) !== (settingsCount === 0)) {
      throw new ConflictException('Installation state is inconsistent');
    }
    if (userCount === 0) return { setupRequired: true, defaultLanguage: null };
    const settings = await this.dataSource.getRepository(InstallationSettings).findOne({ where: { id: 1 } });
    if (!settings) throw new ConflictException('Installation state is inconsistent');
    return { setupRequired: false, defaultLanguage: settings.defaultLanguage };
  }

  async verifyPassword(candidate: string): Promise<{ valid: true }> {
    await this.ensureSetupRequired();
    if (!(await this.passwordMatches(candidate))) {
      throw new UnauthorizedException('Invalid setup password');
    }
    return { valid: true };
  }

  async createInitialUser(input: CreateInitialUserDto): Promise<User> {
    if (!(await this.passwordMatches(input.setupPassword))) {
      throw new UnauthorizedException('Invalid setup password');
    }

    const passwordHash = await hash(input.password, 12);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
      const userCount = await manager.count(User);
      const settingsCount = await manager.count(InstallationSettings);
      if (userCount || settingsCount) {
        if ((userCount === 0) !== (settingsCount === 0)) {
          throw new ConflictException('Installation state is inconsistent');
        }
        throw new ConflictException('System already setup');
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
      if (input.defaultLanguage === 'de') {
        try {
          await this.localizeSeededAgendaSections(manager);
        } catch (error) {
          this.logger.warn(`Seeded agenda-section localization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      delete (saved as Partial<User>).passwordHash;
      return saved;
    });
  }

  private async ensureSetupRequired(): Promise<void> {
    if (!(await this.installation()).setupRequired) {
      throw new ConflictException('System already setup');
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
      if (unmatched.length) this.logger.warn(`Seeded agenda sections not found: ${unmatched.join(', ')}`);

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
