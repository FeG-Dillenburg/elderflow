import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../errors/api-error.filter';
import { TaskDto, TaskUpdateDto } from './task.dto';

describe('Task request shape', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const id = '00000000-0000-4000-8000-000000000050';

  it('accepts canonical encrypted Task fields and rejects plaintext fields', async () => {
    const protectedScalars = {
      titleEnvelope: 'title-ciphertext',
      descriptionEnvelope: 'description-ciphertext',
    };
    await expect(pipe.transform({
      id,
      protected: protectedScalars,
      assignedToId: null,
      dueDate: '2026-08-20',
      status: 'open',
    }, { type: 'body', metatype: TaskDto })).resolves.toMatchObject({
      id,
      protected: protectedScalars,
      status: 'open',
    });

    await expect(pipe.transform({
      id,
      protected: protectedScalars,
      title: 'plaintext',
      status: 'open',
    }, { type: 'body', metatype: TaskDto })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    });
  });

  it('accepts structural-only and encrypted partial updates', async () => {
    await expect(pipe.transform({ status: 'done' }, {
      type: 'body',
      metatype: TaskUpdateDto,
    })).resolves.toEqual({ status: 'done' });
    await expect(pipe.transform({
      protected: { descriptionEnvelope: 'description-ciphertext' },
    }, { type: 'body', metatype: TaskUpdateDto })).resolves.toEqual({
      protected: { descriptionEnvelope: 'description-ciphertext' },
    });
  });
});
