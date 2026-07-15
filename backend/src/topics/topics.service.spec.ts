import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { User } from '../users/user.entity';
import { Topic } from './topic.entity';
import { TopicUpdate } from './topic-update.entity';
import { TopicsService } from './topics.service';

describe('TopicsService', () => {
  const topics = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const updates = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const appearances = { find: jest.fn() };
  let service: TopicsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
      ],
    }).compile();
    service = module.get(TopicsService);
  });

  it('links a new update to the topic and current user', async () => {
    const topic = { id: 'topic-id' } as Topic;
    const user = { id: 'user-id' } as User;
    const update = { id: 'update-id' } as TopicUpdate;
    topics.findOne.mockResolvedValue(topic);
    updates.create.mockReturnValue(update);
    updates.save.mockResolvedValue(update);

    await expect(service.addUpdate(topic.id, { text: '<p>Decision</p>', type: 'decision' }, user)).resolves.toBe(update);
    expect(updates.create).toHaveBeenCalledWith(expect.objectContaining({
      topicId: topic.id,
      createdById: user.id,
      text: '<p>Decision</p>',
      type: 'decision',
    }));
  });
});
