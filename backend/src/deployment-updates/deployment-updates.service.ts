import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { announcementManifest, validateManifest } from './catalog';

const projection = `a.id, a.identifier, a.category, a.registered_at AS "registeredAt"`;

@Injectable()
export class DeploymentUpdatesService implements OnModuleInit {
  constructor(private readonly database: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.register(announcementManifest);
  }

  async register(manifest: unknown): Promise<void> {
    // Validate the entire catalog before opening a transaction. Sorting also
    // gives concurrent startups a consistent unique-index lock order.
    const entries = validateManifest(manifest).sort((a, b) => a.id.localeCompare(b.id));
    await this.database.transaction(async (manager) => {
      for (const entry of entries) {
        await manager.query(`INSERT INTO deployment_announcements (identifier, category)
          VALUES ($1, $2) ON CONFLICT (identifier) DO NOTHING`, [entry.id, entry.category]);
      }
    });
  }

  async unread(userId: string) {
    return this.database.transaction(async (manager) => {
      // Serialize first-session initialization for this user across devices.
      await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const initialized = await manager.query(`INSERT INTO deployment_update_initializations (user_id)
        VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING id`, [userId]);
      if (initialized.length) {
        await manager.query(`INSERT INTO deployment_update_acknowledgements (user_id, announcement_id)
          SELECT $1, id FROM deployment_announcements ON CONFLICT DO NOTHING`, [userId]);
      }
      return manager.query(`SELECT ${projection} FROM deployment_announcements a
        WHERE NOT EXISTS (SELECT 1 FROM deployment_update_acknowledgements r
          WHERE r.user_id = $1 AND r.announcement_id = a.id)
        ORDER BY a.registered_at DESC, a.identifier`, [userId]);
    });
  }

  async acknowledge(userId: string, ids: string[]): Promise<void> {
    await this.database.transaction(async (manager) => {
      const found = await manager.query('SELECT id FROM deployment_announcements WHERE id = ANY($1::uuid[])', [ids]);
      if (found.length !== new Set(ids).size) {
        throw new BadRequestException({ code: 'DEPLOYMENT_UPDATE_IDS_INVALID' });
      }
      await manager.query(`INSERT INTO deployment_update_acknowledgements (user_id, announcement_id)
        SELECT $1, id FROM deployment_announcements WHERE id = ANY($2::uuid[])
        ON CONFLICT (user_id, announcement_id) DO NOTHING`, [userId, ids]);
    });
  }

  history() {
    return this.database.query(`SELECT ${projection} FROM deployment_announcements a
      ORDER BY a.registered_at DESC, a.identifier DESC LIMIT 50`);
  }
}
