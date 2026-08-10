import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../errors/api-error.filter';
import { TopicDto, UpdateTopicFieldsDto } from './topic.dto';

describe('Person Topic request shape', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const metadata = { type: 'body', metatype: TopicDto } as const;
  const protectedScalars = {
    nameEnvelope: 'name-ciphertext',
    descriptionEnvelope: 'description-ciphertext',
    membershipProcessStatusEnvelope: 'process-ciphertext',
    godparentsEnvelope: 'godparents-ciphertext',
  };

  it('accepts the canonical encrypted Person fields without a plaintext request shape', async () => {
    await expect(pipe.transform({
      id: '00000000-0000-4000-8000-000000000010',
      protected: protectedScalars,
      type: 'person',
      status: 'open',
      responsibleUserId: null,
    }, metadata)).resolves.toMatchObject({
      type: 'person',
      responsibleUserId: null,
      protected: protectedScalars,
    });
  });

  it.each(['isRecurring', 'membershipProcessStatus', 'recurrenceInterval'])(
    'rejects the unrelated %s field with a stable validation code',
    async (field) => {
      await expect(pipe.transform({
        id: '00000000-0000-4000-8000-000000000010',
        protected: protectedScalars,
        type: 'person',
        status: 'open',
        [field]: field === 'isRecurring' ? true : 'unexpected',
      }, metadata)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'VALIDATION_FAILED' }),
      });
    },
  );

  it('accepts the typed New membership request shape', async () => {
    await expect(pipe.transform({
      id: '00000000-0000-4000-8000-000000000010',
      protected: protectedScalars,
      type: 'new_membership',
      status: 'open',
      responsibleUserId: null,
      membershipStatusSignal: 'in_progress',
    }, metadata)).resolves.toMatchObject({
      type: 'new_membership',
      membershipStatusSignal: 'in_progress',
    });
  });

  it('validates a partial inline field write independently', async () => {
    await expect(pipe.transform({
      membershipStatusSignal: 'nearly_finished',
    }, { type: 'body', metatype: UpdateTopicFieldsDto })).resolves.toEqual({
      membershipStatusSignal: 'nearly_finished',
    });
  });
});
