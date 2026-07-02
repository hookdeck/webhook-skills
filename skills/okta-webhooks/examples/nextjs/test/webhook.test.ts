// Generated with: okta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'test-shared-secret';

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.OKTA_WEBHOOK_SECRET = SECRET;
  const route = await import('../app/webhooks/okta/route');
  GET = route.GET;
  POST = route.POST;
});

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
          actor: { id: '00u1', type: 'User', alternateId: 'jane@example.com' },
          target: [{ id: '00u1', type: 'User', alternateId: 'jane@example.com' }],
        },
      ],
    },
  };
}

function postRequest(body: unknown, authHeader?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/okta', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Okta verification handshake (GET)', () => {
  it('echoes the x-okta-verification-challenge header', async () => {
    const challenge = '8T3zabc-challenge-value';
    const req = new NextRequest('http://localhost:3000/webhooks/okta', {
      method: 'GET',
      headers: { 'x-okta-verification-challenge': challenge },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verification: challenge });
  });
});

describe('Okta event delivery (POST)', () => {
  it('accepts a POST with a valid Authorization header', async () => {
    const res = await POST(postRequest(samplePayload(), SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a POST with an invalid Authorization header', async () => {
    const res = await POST(postRequest(samplePayload(), 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a POST with a missing Authorization header', async () => {
    const res = await POST(postRequest(samplePayload()));
    expect(res.status).toBe(401);
  });

  it('returns 400 when data.events is missing', async () => {
    const res = await POST(postRequest({ eventType: 'com.okta.event_hook', data: {} }, SECRET));
    expect(res.status).toBe(400);
  });
});
