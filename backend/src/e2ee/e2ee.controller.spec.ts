import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { E2eeController } from './e2ee.controller';
import { E2EE_MEDIA_TYPE } from './e2ee-protocol';
import { E2eeService } from './e2ee.service';

describe('E2eeController binary responses', () => {
  let app: INestApplication;
  const wrapper = Buffer.from([0x86, 0x01, 0x02, 0x03]);

  beforeAll(async () => {
    const service = {
      keyWrapper: jest.fn().mockResolvedValue(wrapper),
      recoverySlot: jest.fn().mockResolvedValue(wrapper),
      recoveryCandidate: jest.fn().mockResolvedValue(wrapper),
    };
    const module = await Test.createTestingModule({
      controllers: [E2eeController],
      providers: [{ provide: E2eeService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/api/e2ee/key-state/shared-passphrase-slot',
    '/api/e2ee/key-state/content-key-wrapper',
    '/api/e2ee/recovery-slot',
    '/api/e2ee/recovery-ceremonies/ceremony-id/candidate-shared-passphrase-slot',
  ])('returns raw canonical bytes from %s', async (path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('Content-Type', E2EE_MEDIA_TYPE);

    expect(response.body).toEqual(wrapper);
  });
});
