import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_x_hub_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.ATHENAHEALTH_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/athenahealth/route'));
});

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Subscription notification Bundle: SubscriptionStatus first, then one AuditEvent per event
function bundle(topic: string, count = 1): string {
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
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/athenahealth', {
    method: 'POST',
    headers: { 'content-type': 'application/fhir+json', ...headers },
    body,
  });
}

describe('athenahealth webhook route', () => {
  const topics = [
    'Appointment.schedule', 'Appointment.cancel', 'Appointment.reschedule',
    'Appointment.check-in', 'Appointment.update',
    'Encounter.check-in', 'Encounter.signoff',
    'LabResult.create', 'LabResult.close',
    'Patient.create', 'Patient.update',
  ];

  it.each(topics)('accepts a signed %s notification', async (topic) => {
    const body = bundle(topic);
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a batched notification', async () => {
    const body = bundle('Appointment.schedule', 3);
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = bundle('Appointment.schedule');
    const res = await POST(makeRequest(body, { 'x-hub-signature': 'sha256=' + sign(body).slice(7).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = bundle('Appointment.cancel');
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown topics', async () => {
    const body = bundle('Something.else');
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = bundle('Appointment.schedule');
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const res = await POST(makeRequest(bundle('Appointment.cancel'), { 'x-hub-signature': sign(bundle('Appointment.schedule')) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for other methods, malformed, short, non-hex, and non-ASCII headers', async () => {
    const body = bundle('Appointment.schedule');
    const hex = sign(body).slice(7);
    const headers = [
      `sha1=${hex}`, `sha512=${hex}`, hex, 'garbage', 'sha256=abc',
      'sha256=' + 'z'.repeat(64), 'sha256=' + 'é'.repeat(64),
      // Valid hex followed by junk must not pass (no silent truncation)
      `sha256=${hex}zz`,
    ];
    for (const h of headers) {
      const res = await POST(makeRequest(body, { 'x-hub-signature': h }));
      expect(res.status).toBe(401);
    }
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(makeRequest(bundle('Appointment.schedule')));
    expect(res.status).toBe(401);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not a notification Bundle', async () => {
    const body = JSON.stringify({ resourceType: 'Patient' });
    const res = await POST(makeRequest(body, { 'x-hub-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
