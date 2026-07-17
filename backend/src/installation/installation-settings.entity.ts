import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { SupportedLanguage } from './language';

@Entity({ name: 'installation_settings' })
@Check('installation_settings_singleton_check', '"id" = 1')
@Check('installation_settings_language_check', '"default_language" IN (\'en\', \'de\')')
export class InstallationSettings {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ name: 'default_language', type: 'text' })
  defaultLanguage: SupportedLanguage;
}
