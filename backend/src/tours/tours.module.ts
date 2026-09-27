import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Injectable, Module, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../auth/current-user.decorator';
import { permissionsByRole } from '../auth/permissions';
import { isProtectedTextReader } from '../e2ee/e2ee-role-policy';
import { User } from '../users/user.entity';

const definitions = {
  'first-login': ['welcome', 'protected-text-encryption', 'protected-text-passphrase', 'dashboard-overview', 'meetings-navigation', 'topics-navigation', 'profile-settings', 'sign-out'],
  'new-topic-dialog': ['topic-type-generic', 'topic-type-person', 'topic-type-new-membership', 'topic-type-recurring'],
} as const;

class TourEventDto {
  @IsIn(Object.keys(definitions))
  tourId!: keyof typeof definitions;

  @IsInt()
  @Min(1)
  version!: number;

  @IsIn(['start', 'step', 'skip', 'complete'])
  event!: 'start' | 'step' | 'skip' | 'complete';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stepId?: string;
}

const projection = `tour_id AS "tourId", version, state, last_step_id AS "lastStepId",
  attempts, first_started_at AS "firstStartedAt", last_started_at AS "lastStartedAt",
  last_skipped_at AS "lastSkippedAt", completed_at AS "completedAt"`;

@Injectable()
export class ToursService {
  constructor(private readonly database: DataSource) {}

  list(user: User) {
    return this.database.query(`SELECT ${projection} FROM tour_progress WHERE user_id = $1`, [user.id]);
  }

  async record(user: User, input: TourEventDto) {
    if (!isProtectedTextReader(user.role)
      || (input.tourId === 'new-topic-dialog' && permissionsByRole[user.role].topics !== 'manage')) {
      throw new ForbiddenException({ code: 'AUTH_FORBIDDEN' });
    }
    const steps: readonly string[] = definitions[input.tourId];
    if (input.version !== 1 || !steps
      || (input.stepId !== undefined && !steps.includes(input.stepId))
      || (input.event === 'complete' && input.stepId !== steps[steps.length - 1])) {
      throw new BadRequestException({ code: 'TOUR_EVENT_INVALID' });
    }
    // One atomic upsert prevents concurrent tabs from erasing a completed version.
    const state = input.event === 'complete' ? 'completed' : input.event === 'skip' ? 'skipped' : 'started';
    const rows = await this.database.query(`
      INSERT INTO tour_progress (user_id, tour_id, version, state, last_step_id, attempts,
        first_started_at, last_started_at, last_skipped_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 = 'start' THEN 1 ELSE 0 END,
        CASE WHEN $6 = 'start' THEN now() END, CASE WHEN $6 = 'start' THEN now() END,
        CASE WHEN $6 = 'skip' THEN now() END, CASE WHEN $6 = 'complete' THEN now() END)
      ON CONFLICT (user_id, tour_id, version) DO UPDATE SET
        state = CASE WHEN tour_progress.completed_at IS NOT NULL THEN 'completed' ELSE EXCLUDED.state END,
        last_step_id = COALESCE(EXCLUDED.last_step_id, tour_progress.last_step_id),
        attempts = tour_progress.attempts + EXCLUDED.attempts,
        first_started_at = COALESCE(tour_progress.first_started_at, EXCLUDED.first_started_at),
        last_started_at = COALESCE(EXCLUDED.last_started_at, tour_progress.last_started_at),
        last_skipped_at = COALESCE(EXCLUDED.last_skipped_at, tour_progress.last_skipped_at),
        completed_at = COALESCE(tour_progress.completed_at, EXCLUDED.completed_at)
      RETURNING ${projection}
    `, [user.id, input.tourId, input.version, state, input.stepId ?? null, input.event]);
    return rows[0];
  }
}

@Controller('api/tours')
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: User) { return this.tours.list(user); }

  @Post('events')
  record(@CurrentUser() user: User, @Body() input: TourEventDto) {
    return this.tours.record(user, input);
  }
}

@Module({ controllers: [ToursController], providers: [ToursService] })
export class ToursModule {}
