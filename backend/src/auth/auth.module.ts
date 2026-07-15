import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { DevelopmentIdentityGuard } from './development-identity.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: DevelopmentIdentityGuard }],
})
export class AuthModule {}
