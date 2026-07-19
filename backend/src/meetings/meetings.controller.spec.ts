import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { Reflector } from '@nestjs/core';
import { PERMISSION_CATEGORY_KEY } from '../auth/permissions';

describe('MeetingsController completion boundary', () => {
  let app: INestApplication;
  const service = {
    complete: jest.fn(),
    updateTopicFields: jest.fn(),
    updateTopicNote: jest.fn(),
  };
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
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

  it('writes only the note field through the appearance-note HTTP endpoint', async () => {
    const appearance = {
      id: '00000000-0000-4000-8000-000000000003',
      meetingId: '00000000-0000-4000-8000-000000000001',
      agendaNote: 'Private context',
    };
    service.updateTopicNote.mockResolvedValue(appearance);

    await request(app.getHttpServer())
      .put(`/api/meetings/${appearance.meetingId}/topics/${appearance.id}/note`)
      .send({ agendaNote: appearance.agendaNote })
      .expect(200)
      .expect(appearance);

    expect(service.updateTopicNote).toHaveBeenCalledWith(
      appearance.meetingId,
      appearance.id,
      appearance.agendaNote,
    );
  });

  it('rejects unrelated fields on the appearance-note HTTP endpoint', async () => {
    await request(app.getHttpServer())
      .put('/api/meetings/00000000-0000-4000-8000-000000000001/topics/00000000-0000-4000-8000-000000000003/note')
      .send({ agendaNote: 'Note', membershipProcessStatus: 'Started' })
      .expect(400);

    expect(service.updateTopicNote).not.toHaveBeenCalled();
  });

  it('writes only independently validated fields through the appearance endpoint', async () => {
    const meetingId = '00000000-0000-4000-8000-000000000001';
    const appearanceId = '00000000-0000-4000-8000-000000000003';
    const topic = {
      id: '00000000-0000-4000-8000-000000000004',
      membershipStatusSignal: 'attention',
    };
    service.updateTopicFields.mockResolvedValue(topic);

    await request(app.getHttpServer())
      .put(`/api/meetings/${meetingId}/topics/${appearanceId}/fields`)
      .send({ membershipStatusSignal: 'attention' })
      .expect(200)
      .expect(topic);

    expect(service.updateTopicFields).toHaveBeenCalledWith(
      meetingId,
      appearanceId,
      { membershipStatusSignal: 'attention' },
    );
  });

  it('protects the appearance-note endpoint with Meeting authorization', () => {
    const permission = new Reflector().getAllAndOverride(
      PERMISSION_CATEGORY_KEY,
      [MeetingsController.prototype.updateTopicNote, MeetingsController],
    );

    expect(permission).toBe('meetings');
  });
});
