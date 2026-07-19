import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

describe('MeetingsController completion boundary', () => {
  let app: INestApplication;
  const service = { complete: jest.fn() };
  const currentUser = { id: '00000000-0000-4000-8000-000000000002' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MeetingsController],
      providers: [{ provide: MeetingsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use((request_: any, _response: any, next: () => void) => {
      request_.user = currentUser;
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('completes a Meeting through its explicit HTTP action as the current user', async () => {
    const meeting = {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'completed',
    };
    service.complete.mockResolvedValue(meeting);

    await request(app.getHttpServer())
      .post(`/api/meetings/${meeting.id}/complete`)
      .expect(201)
      .expect(meeting);

    expect(service.complete).toHaveBeenCalledWith(meeting.id, currentUser);
  });
});
