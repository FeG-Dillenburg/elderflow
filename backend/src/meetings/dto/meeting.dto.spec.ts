import { ValidationPipe } from '@nestjs/common';
import { UpdateMeetingTopicDto } from './meeting.dto';

describe('Meeting appearance patch request', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: 'body' as const, metatype: UpdateMeetingTopicDto };

  it.each([{ topicStatusDecision: 'done' }, { topicStatusDecision: 'deferred' }, { topicStatusDecision: null }, { status: 'done' }, { deferred: true }, { deferred: false },
    { plannedDuration: 1 }, { plannedDuration: null }])('accepts only intended changes: %j', async (patch) => {
    await expect(pipe.transform(patch, metadata)).resolves.toEqual(patch);
  });

  it.each([{ topicStatusDecision: 'open' }, { topicStatusDecision: true }, { position: 1 }, { sectionId: '00000000-0000-4000-8000-000000000001' },
    { status: null }, { deferred: null }, { plannedDuration: 0 }, { plannedDuration: 1.5 }])(
    'rejects structural fields and invalid patch values: %j', async (patch) => {
      await expect(pipe.transform(patch, metadata)).rejects.toThrow();
    },
  );
});
