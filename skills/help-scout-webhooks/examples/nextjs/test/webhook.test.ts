import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyHelpScoutWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/help-scout/route';

const SECRET = 'test_helpscout_secret';

beforeAll(() => {
  process.env.HELPSCOUT_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Help Scout signature: base64 HMAC-SHA1 of the raw body
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('base64');
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/webhooks/help-scout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

// Test vector from the Help Scout webhook documentation
const DOCS_SECRET = 'your secret key';
const DOCS_BODY =
  '{"ticket":{"id":"1","number":"2"},"customer":{"id":"1","fname":"Jackie","lname":"Chan","email":"jackie.chan@somewhere.com","emails":["jackie.chan@somewhere.com"]}}';
const DOCS_SIGNATURE = 'I1KlvGppYqvFTJgJ9jezdQMDiyI=';

describe('verifyHelpScoutWebhook', () => {
  it('matches the signature from the Help Scout docs', () => {
    expect(generateSignature(DOCS_BODY, DOCS_SECRET)).toBe(DOCS_SIGNATURE);
    expect(verifyHelpScoutWebhook(DOCS_BODY, DOCS_SIGNATURE, DOCS_SECRET)).toBe(true);
  });

  it('returns true for a valid signature', () => {
    const body = '{"id":123}';
    expect(verifyHelpScoutWebhook(body, generateSignature(body, SECRET), SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyHelpScoutWebhook('{"id":123}', 'invalid_signature', SECRET)).toBe(false);
  });

  it('returns false for a signature signed with another secret', () => {
    const body = '{"id":123}';
    expect(verifyHelpScoutWebhook(body, generateSignature(body, 'other'), SECRET)).toBe(false);
  });

  it('returns false when the header or secret is missing', () => {
    expect(verifyHelpScoutWebhook('{}', null, SECRET)).toBe(false);
    expect(verifyHelpScoutWebhook('{}', 'abc', undefined)).toBe(false);
  });
});

describe('POST /webhooks/help-scout', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest('{"id":1}', { 'x-helpscout-event': 'convo.created' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest('{"id":1}', {
        'x-helpscout-signature': 'invalid_signature',
        'x-helpscout-event': 'convo.created',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  const events = [
    'convo.created',
    'convo.assigned',
    'convo.status',
    'convo.customer.reply.created',
    'convo.agent.reply.created',
    'customer.created',
    'customer.updated',
    'satisfaction.ratings',
  ];

  it.each(events)('accepts a signed %s event', async (event) => {
    const body = JSON.stringify({ id: 123, subject: 'Help', status: 'active' });
    const res = await POST(
      makeRequest(body, {
        'x-helpscout-signature': generateSignature(body, SECRET),
        'x-helpscout-event': event,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify({ id: 1 });
    const res = await POST(
      makeRequest(body, {
        'content-type': 'text/plain',
        'x-helpscout-signature': generateSignature(body, SECRET),
        'x-helpscout-event': 'convo.created',
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const res = await POST(
      makeRequest('{"id":2}', {
        'x-helpscout-signature': generateSignature('{"id":1}', SECRET),
        'x-helpscout-event': 'convo.created',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for an unhandled event with a valid signature', async () => {
    const body = JSON.stringify({ id: 9 });
    const res = await POST(
      makeRequest(body, {
        'x-helpscout-signature': generateSignature(body, SECRET),
        'x-helpscout-event': 'tag.created',
      })
    );
    expect(res.status).toBe(200);
  });
});
