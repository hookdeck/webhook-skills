import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// MailerLite secrets are short per-webhook strings (e.g. "ybmcD7PQ9R"), used as UTF-8
const secret = 'ybmcD7PQ9R';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MAILERLITE_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/mailerlite/route'));
});

/**
 * Generate a valid MailerLite signature: bare hex HMAC-SHA256 of the raw body
 */
function sign(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/mailerlite', {
    method: 'POST',
    headers,
    body,
  });
}

const subscriberCreated = JSON.stringify({
  id: '100000000000000000',
  email: 'john.doe@example.com',
  status: 'active',
  event: 'subscriber.created',
  account_id: 0,
});

const campaignSent = JSON.stringify({
  id: '100000000000000000',
  name: 'Campaign name',
  total_recipients: 1000,
  event: 'campaign.sent',
  account_id: 0,
});

const batched = JSON.stringify({
  events: [
    { type: 'campaign.open', subscriber: { email: 'a@example.com' }, campaign: { name: 'C' } },
    { type: 'campaign.click', subscriber: { email: 'b@example.com' }, campaign: { name: 'C' } },
  ],
  total: 2,
});

describe('POST /webhooks/mailerlite', () => {
  it('accepts a signed subscriber.created event', async () => {
    const res = await POST(makeRequest(subscriberCreated, sign(subscriberCreated, secret)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed campaign.sent event', async () => {
    const res = await POST(makeRequest(campaignSent, sign(campaignSent, secret)));
    expect(res.status).toBe(200);
  });

  it('accepts a signed batched payload', async () => {
    const res = await POST(makeRequest(batched, sign(batched, secret)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(subscriberCreated, sign(subscriberCreated, secret), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(subscriberCreated));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature from the wrong secret', async () => {
    const res = await POST(makeRequest(subscriberCreated, sign(subscriberCreated, 'other')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await POST(makeRequest(subscriberCreated, 'abc'));
    expect(res.status).toBe(400);
  });

  it('rejects a sha256= prefixed signature (MailerLite sends bare hex)', async () => {
    const res = await POST(makeRequest(subscriberCreated, `sha256=${sign(subscriberCreated, secret)}`));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a modified body', async () => {
    const res = await POST(makeRequest(subscriberCreated + ' ', sign(subscriberCreated, secret)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const res = await POST(makeRequest('not json', sign('not json', secret)));
    expect(res.status).toBe(400);
  });
});
