import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiErrorFilter, validationExceptionFactory } from './errors/api-error.filter';
import { raw, static as serveStatic, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isE2eeMediaType } from './e2ee/e2ee-protocol';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use('/api/meetings', raw({ type: isE2eeMediaType, limit: '17mb' }));
  app.use(raw({ type: isE2eeMediaType, limit: '16kb' }));
  app.enableCors();

  const frontendDirectory = join(process.cwd(), 'frontend', 'dist');
  const frontendIndex = join(frontendDirectory, 'index.html');
  if (existsSync(frontendIndex)) {
    const serveFrontend = serveStatic(frontendDirectory);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method !== 'GET' || request.path.startsWith('/api') || request.path === '/health') {
        next();
        return;
      }

      serveFrontend(request, response, () => response.sendFile(frontendIndex));
    });
  }

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
