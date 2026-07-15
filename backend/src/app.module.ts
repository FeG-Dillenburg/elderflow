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
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
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
  ],
  controllers: [AppController],
  providers: [DatabaseService],
})
export class AppModule {}
