const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_x_hub_secret';
process.env.ATHENAHEALTH_WEBHOOK_SECRET = SECRET;

const { app, verifyAthenahealthWebhook } = require('../src/index');

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Subscription notification Bundle: SubscriptionStatus first, then one AuditEvent per event
const bundle = (topic, count = 1) => {
  const ids = Array.from({ length: count }, (_, i) => `cb6cc377-ee38-31ba-9482-f93f821cd16${i}`);
  return JSON.stringify({
    resourceType: 'Bundle',
    id: '3945182f-d315-4dbf-9259-09d863c7e7da',
    type: 'history',
    timestamp: '2021-03-31T16:20:01.123Z',
    entry: [
      {
        resource: {
          resourceType: 'SubscriptionStatus',
          status: 'active',
          type: 'event-notification',
          eventsInNotification: count,
          subscription: { reference: 'Subscription/a9c3784c-9f56-4b32-95b0-882868d39e58' },
          topic: `https://api.platform.athenahealth.com/fhir/r4/SubscriptionTopic/${topic}`,
          notificationEvent: ids.map((id, i) => ({
            eventNumber: String(i + 1),
            id,
            timestamp: '2021-03-31T16:20:12.000Z',
            focus: { reference: `Appointment/a-432.${i + 1}` },
          })),
        },
      },
      ...ids.map((id) => ({ resource: { resourceType: 'AuditEvent', id, type: { code: topic } } })),
    ],
  });
};

describe('verifyAthenahealthWebhook', () => {
  const body = Buffer.from(bundle('Appointment.schedule'));

  it('accepts a valid signature', () => {
    expect(verifyAthenahealthWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const upper = 'sha256=' + sign(body).slice(7).toUpperCase();
    expect(verifyAthenahealthWebhook(body, upper, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyAthenahealthWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyAthenahealthWebhook(Buffer.from(bundle('Appointment.cancel')), sign(body), SECRET)).toBe(false);
  });

  it('rejects other methods, malformed, short, non-hex, non-ASCII, and missing headers', () => {
    const hex = sign(body).slice(7);
    expect(verifyAthenahealthWebhook(body, `sha1=${hex}`, SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, `sha512=${hex}`, SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, hex, SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, 'sha256=abc', SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, 'sha256=' + 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, 'sha256=' + 'é'.repeat(64), SECRET)).toBe(false);
    // Valid hex followed by junk must not pass (no silent truncation)
    expect(verifyAthenahealthWebhook(body, `sha256=${hex}zz`, SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyAthenahealthWebhook(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/athenahealth', () => {
  const topics = [
    'Appointment.schedule', 'Appointment.cancel', 'Appointment.reschedule',
    'Appointment.check-in', 'Appointment.update',
    'Encounter.check-in', 'Encounter.signoff',
    'LabResult.create', 'LabResult.close',
    'Patient.create', 'Patient.update',
  ];

  it.each(topics)('accepts a signed %s notification', async (topic) => {
    const body = bundle(topic);
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a batched notification', async () => {
    const body = bundle('Appointment.schedule', 3);
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = bundle('Appointment.cancel');
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'text/plain')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown topics', async () => {
    const body = bundle('Something.else');
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = bundle('Appointment.schedule');
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body, 'wrong'))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-sha256 method', async () => {
    const body = bundle('Appointment.schedule');
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body).replace('sha256', 'sha512'))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .send(bundle('Appointment.schedule'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'text/plain')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not a notification Bundle', async () => {
    const body = JSON.stringify({ resourceType: 'Patient' });
    const res = await request(app)
      .post('/webhooks/athenahealth')
      .set('Content-Type', 'application/fhir+json')
      .set('X-Hub-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
