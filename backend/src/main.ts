import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter, validationExceptionFactory } from './errors/api-error.filter';
import { raw } from 'express';
import { isE2eeMediaType } from './e2ee/e2ee-protocol';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use('/api/meetings', raw({ type: isE2eeMediaType, limit: '17mb' }));
  app.use(raw({ type: isE2eeMediaType, limit: '16kb' }));
  app.enableCors();
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
