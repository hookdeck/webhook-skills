import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Any string works: Mailcoach uses the secret as-is (UTF-8), not decoded
const SECRET = 'test_mailcoach_webhook_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MAILCOACH_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/mailcoach/route'));
});

function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function subscriberPayload(event = 'SubscribedEvent') {
  return JSON.stringify({
    event,
    email_list_uuid: '8d0c2a8e-1c5b-4e0a-9d54-0f9b1b6a7c11',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    extra_attributes: [],
    tags: ['newsletter'],
    subscribed_at: '2026-10-26T09:00:00.000000Z',
    unsubscribed_at: null,
    created_at: '2026-10-26T08:59:00.000000Z',
    updated_at: '2026-10-26T09:00:00.000000Z',
  });
}

function campaignPayload() {
  return JSON.stringify({
    event: 'CampaignSentEvent',
    uuid: '3f6d7a1c-6b0e-4a39-8a4c-2c1d9e0b5f22',
    name: 'October newsletter',
    email_list_uuid: '8d0c2a8e-1c5b-4e0a-9d54-0f9b1b6a7c11',
    status: 'sent',
    sent_to_number_of_subscribers: 1280,
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost/webhooks/mailcoach', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Mailcoach webhook', () => {
  it.each(['SubscribedEvent', 'UnsubscribedEvent', 'UnconfirmedSubscriberCreatedEvent'])(
    'accepts a valid %s',
    async (event) => {
      const body = subscriberPayload(event);
      const res = await POST(makeRequest(body, { signature: sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  );

  it('accepts a valid CampaignSentEvent', async () => {
    const body = campaignPayload();
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies the exact raw bytes for any content type', async () => {
    const body = subscriberPayload();
    const res = await POST(makeRequest(body, { signature: sign(body) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies a body that is not canonical JSON (no re-encoding)', async () => {
    const body = '{ "event" : "SubscribedEvent",\n  "email":"a@b.co" }';
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = subscriberPayload();
    const res = await POST(makeRequest(body, { signature: sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('accepts unhandled event names with a valid signature', async () => {
    const body = subscriberPayload('TagAddedEvent');
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Signature header (unsigned delivery)', async () => {
    const res = await POST(makeRequest(subscriberPayload()));
    expect(res.status).toBe(401);
  });

  it('rejects an empty Signature header', async () => {
    const res = await POST(makeRequest(subscriberPayload(), { signature: '' }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = subscriberPayload();
    const res = await POST(makeRequest(body, { signature: sign(body, 'wrong_secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = subscriberPayload();
    const res = await POST(makeRequest(body.replace('jane@', 'eve@'), { signature: sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects a re-encoded body (different bytes, same JSON)', async () => {
    const body = subscriberPayload();
    const res = await POST(makeRequest(JSON.stringify(JSON.parse(body), null, 2), { signature: sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects a prefixed, non-hex or wrong-length digest', async () => {
    const body = subscriberPayload();
    const good = sign(body);
    for (const bad of ['sha256=' + good, 'zz' + good.slice(2), good.slice(2), good + 'ab']) {
      const res = await POST(makeRequest(body, { signature: bad }));
      expect(res.status).toBe(401);
    }
  });

  it('rejects a valid signature over invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(400);
  });
});
