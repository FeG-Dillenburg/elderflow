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
    updateTopic: jest.fn(),
    updateTopicFields: jest.fn(),
    updatePreparationContext: jest.fn(),
    updatePersonNote: jest.fn(),
    updateMeetingMinutes: jest.fn(),
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

  it('accepts a validated deferral intent on the Meeting appearance update', async () => {
    const meetingId = '00000000-0000-4000-8000-000000000001';
    const appearanceId = '00000000-0000-4000-8000-000000000003';
    const appearance = { id: appearanceId, deferredAt: '2026-07-15T20:30:00.000Z' };
    service.updateTopic.mockResolvedValue(appearance);

    await request(app.getHttpServer())
      .put(`/api/meetings/${meetingId}/topics/${appearanceId}`)
      .send({
        sectionId: '00000000-0000-4000-8000-000000000004',
        position: 1,
        status: 'planned',
        deferred: true,
      })
      .expect(200)
      .expect(appearance);

    expect(service.updateTopic).toHaveBeenCalledWith(
      meetingId,
      appearanceId,
      expect.objectContaining({ deferred: true }),
    );
  });

  it('protects semantic Meeting-text endpoints with Meeting authorization', () => {
    const preparationPermission = new Reflector().getAllAndOverride(
      PERMISSION_CATEGORY_KEY,
      [MeetingsController.prototype.updatePreparationContext, MeetingsController],
    );
    const minutesPermission = new Reflector().getAllAndOverride(
      PERMISSION_CATEGORY_KEY,
      [MeetingsController.prototype.updateMeetingMinutes, MeetingsController],
    );

    expect(preparationPermission).toBe('meetings');
    expect(minutesPermission).toBe('meetings');
  });

  it('exposes semantic, versioned endpoints for preparation context, Person notes, and Meeting minutes', async () => {
    const meetingId = '00000000-0000-4000-8000-000000000001';
    const appearanceId = '00000000-0000-4000-8000-000000000003';
    service.updatePreparationContext.mockResolvedValue({ id: appearanceId });
    service.updatePersonNote.mockResolvedValue({ id: appearanceId });
    service.updateMeetingMinutes.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000004',
      text: 'Minutes',
      version: 1,
    });

    await request(app.getHttpServer())
      .put(`/api/meetings/${meetingId}/topics/${appearanceId}/preparation-context`)
      .send({ text: 'Context', version: 2 })
      .expect(200);
    expect(service.updatePreparationContext).toHaveBeenCalledWith(
      meetingId,
      appearanceId,
      'Context',
      2,
    );

    await request(app.getHttpServer())
      .put(`/api/meetings/${meetingId}/topics/${appearanceId}/person-note`)
      .send({ text: 'Person note', version: 3 })
      .expect(200);
    expect(service.updatePersonNote).toHaveBeenCalledWith(
      meetingId,
      appearanceId,
      'Person note',
      3,
    );

    await request(app.getHttpServer())
      .put(`/api/meetings/${meetingId}/topics/${appearanceId}/minutes`)
      .send({ text: 'Minutes', version: null })
      .expect(200);
    expect(service.updateMeetingMinutes).toHaveBeenCalledWith(
      meetingId,
      appearanceId,
      { text: 'Minutes', version: null },
      currentUser,
    );
  });

  it('rejects invalid semantic Meeting-text payloads', async () => {
    const base = '/api/meetings/00000000-0000-4000-8000-000000000001/topics/00000000-0000-4000-8000-000000000003';

    await request(app.getHttpServer())
      .put(`${base}/preparation-context`)
      .send({ text: 'Context', version: -1 })
      .expect(400);
    await request(app.getHttpServer())
      .put(`${base}/minutes`)
      .send({ text: 42, version: null })
      .expect(400);
  });
});
