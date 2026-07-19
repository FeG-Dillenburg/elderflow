import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../errors/api-error.filter';
import { TopicDto } from './topic.dto';

describe('Person Topic request shape', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const metadata = { type: 'body', metatype: TopicDto } as const;

  it('accepts the canonical common Person fields', async () => {
    await expect(pipe.transform({
      name: 'Alex and Sam',
      description: 'Pastoral context',
      type: 'person',
      status: 'open',
      responsibleUserId: null,
    }, metadata)).resolves.toMatchObject({
      name: 'Alex and Sam',
      type: 'person',
      responsibleUserId: null,
    });
  });

  it.each(['isRecurring', 'membershipProcessStatus', 'recurrenceInterval'])(
    'rejects the unrelated %s field with a stable validation code',
    async (field) => {
      await expect(pipe.transform({
        name: 'Alex',
        type: 'person',
        status: 'open',
        [field]: field === 'isRecurring' ? true : 'unexpected',
      }, metadata)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'VALIDATION_FAILED' }),
      });
    },
  );
});
