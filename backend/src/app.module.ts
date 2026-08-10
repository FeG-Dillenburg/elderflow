import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Joi from 'joi';
import { AppController } from './app.controller';
import { DatabaseService } from './database/database.service';
import { UsersModule } from './users/users.module';
import { AgendaSectionsModule } from './agenda-sections/agenda-sections.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MeetingsModule } from './meetings/meetings.module';
import { TasksModule } from './tasks/tasks.module';
import { TopicsModule } from './topics/topics.module';
import { migrations } from './database/migrations';
import { SetupModule } from './setup/setup.module';
import { E2eeModule } from './e2ee/e2ee.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProtectedTextGateInterceptor } from './e2ee/protected-text-gate.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().port().default(3000),
        DATABASE_URL: Joi.string().uri().required(),
        DEV_USER_EMAIL: Joi.string().email().when('NODE_ENV', {
          is: Joi.valid('development', 'test'),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        DEV_AUTH_BYPASS: Joi.boolean().default(false),
        AUTH_SESSION_SECRET: Joi.string().min(32).when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.string().default('elderflow-development-session-secret'),
        }),
        E2EE_DEVELOPMENT_GATE: Joi.boolean().default(false).when('NODE_ENV', {
          is: 'production',
          then: Joi.valid(false),
        }),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        migrations,
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    AuthModule,
    AgendaSectionsModule,
    TopicsModule,
    MeetingsModule,
    TasksModule,
    DashboardModule,
    SetupModule,
    E2eeModule,
  ],
  controllers: [AppController],
  providers: [
    DatabaseService,
    { provide: APP_INTERCEPTOR, useClass: ProtectedTextGateInterceptor },
  ],
})
export class AppModule {}
