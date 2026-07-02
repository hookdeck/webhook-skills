// Generated with: okta-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

const SECRET = 'test-shared-secret';
process.env.OKTA_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function samplePayload() {
  return {
    eventType: 'com.okta.event_hook',
    eventTime: '2026-07-02T12:00:00.000Z',
    eventId: 'b5a4-test',
    data: {
      events: [
        {
          uuid: 'd6f5-test',
          eventType: 'user.session.start',
          displayMessage: 'User login to Okta',
          published: '2026-07-02T12:00:00.000Z',
          actor: { id: '00u1', type: 'User', alternateId: 'jane@example.com' },
          target: [{ id: '00u1', type: 'User', alternateId: 'jane@example.com' }],
        },
      ],
    },
  };
}

describe('Okta verification handshake (GET)', () => {
  it('echoes the x-okta-verification-challenge header', async () => {
    const challenge = '8T3zabc-challenge-value';
    const res = await request(app)
      .get('/webhooks/okta')
      .set('x-okta-verification-challenge', challenge);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verification: challenge });
  });
});

describe('Okta event delivery (POST)', () => {
  it('accepts a POST with a valid Authorization header', async () => {
    const res = await request(app)
      .post('/webhooks/okta')
      .set('Authorization', SECRET)
      .send(samplePayload());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a POST with an invalid Authorization header', async () => {
    const res = await request(app)
      .post('/webhooks/okta')
      .set('Authorization', 'wrong-secret')
      .send(samplePayload());

    expect(res.status).toBe(401);
  });

  it('rejects a POST with a missing Authorization header', async () => {
    const res = await request(app).post('/webhooks/okta').send(samplePayload());

    expect(res.status).toBe(401);
  });

  it('returns 400 when data.events is missing', async () => {
    const res = await request(app)
      .post('/webhooks/okta')
      .set('Authorization', SECRET)
      .send({ eventType: 'com.okta.event_hook', data: {} });

    expect(res.status).toBe(400);
  });
});
