import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/klaviyo/route';

const SECRET = 'test_klaviyo_secret_key_1234';

beforeAll(() => {
  process.env.KLAVIYO_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Klaviyo signature for testing.
 * Matches Klaviyo's scheme: HMAC-SHA256(secret, rawBody + timestamp), hex.
 */
function generateKlaviyoSignature(payload: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .update(timestamp)
    .digest('hex');
}

function samplePayload(topic = 'event:klaviyo.opened_email'): string {
  return JSON.stringify({
    data: [{ external_id: 'evt_123', topic, payload: { foo: 'bar' } }],
    meta: { klaviyo_webhook_id: 'whk_1', timestamp: '2026-07-02T12:00:00+00:00' },
  });
}

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/klaviyo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const timestamp = '1751457600';

describe('POST /webhooks/klaviyo', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await POST(makeRequest(samplePayload(), {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(samplePayload(), {
        'klaviyo-signature': 'invalid',
        'klaviyo-timestamp': timestamp,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = samplePayload();
    const signature = generateKlaviyoSignature(payload, timestamp, SECRET);

    const res = await POST(
      makeRequest(payload, {
        'klaviyo-signature': signature,
        'klaviyo-timestamp': timestamp,
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a tampered timestamp', async () => {
    const payload = samplePayload();
    const signature = generateKlaviyoSignature(payload, timestamp, SECRET);

    const res = await POST(
      makeRequest(payload, {
        'klaviyo-signature': signature,
        'klaviyo-timestamp': '9999999999',
      })
    );

    expect(res.status).toBe(400);
  });

  it('handles different event topics', async () => {
    const topics = [
      'event:klaviyo.opened_email',
      'event:klaviyo.clicked_email',
      'event:klaviyo.bounced_email',
      'event:klaviyo.marked_email_as_spam',
      'event:klaviyo.unsubscribed_from_email_marketing',
      'event:klaviyo.sent_sms',
      'event:klaviyo.received_sms',
      'event:klaviyo.submitted_review',
    ];

    for (const topic of topics) {
      const payload = samplePayload(topic);
      const signature = generateKlaviyoSignature(payload, timestamp, SECRET);

      const res = await POST(
        makeRequest(payload, {
          'klaviyo-signature': signature,
          'klaviyo-timestamp': timestamp,
        })
      );

      expect(res.status).toBe(200);
    }
  });

  it('processes a batch of multiple events', async () => {
    const payload = JSON.stringify({
      data: [
        { external_id: 'e1', topic: 'event:klaviyo.opened_email', payload: {} },
        { external_id: 'e2', topic: 'event:klaviyo.clicked_email', payload: {} },
      ],
      meta: { klaviyo_webhook_id: 'whk_1' },
    });
    const signature = generateKlaviyoSignature(payload, timestamp, SECRET);

    const res = await POST(
      makeRequest(payload, {
        'klaviyo-signature': signature,
        'klaviyo-timestamp': timestamp,
      })
    );

    expect(res.status).toBe(200);
  });
});
