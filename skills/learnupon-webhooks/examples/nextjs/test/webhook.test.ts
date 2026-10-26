import crypto from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/learnupon/route';
import { verifyLearnuponSignature, seenWebhookIds } from '../lib/verify-learnupon';

const SECRET = 'test_learnupon_secret_0123456789';

// Published test vector from LearnUpon's docs (webhooks v2.0 signature example).
const VECTOR = {
  secret: '00000AB00C0D0E00F0A',
  body: "{\"data\":[{\"enrollmentId\":19090500,\"user\":{\"userId\":291164,\"email\":\"beatrice.dansk@yourdomain.com\",\"username\":null},\"courseId\":1807600,\"dueDate\":\"2024-03-03T18:13:09.000Z\",\"eventCreated\":\"2024-02-02T18:13:10.038Z\",\"wasRecertified\":false}]}",
  signature: 'a403759157e609bf3852001ff9d83db59b454a82841c4369b0e65d066035af45',
};

const EVENTS = [
  'user_created', 'user_updated',
  'course_cloning_complete', 'course_completion', 'course_updated',
  'module_complete', 'purchase_completion',
  'badge_awarded', 'badge_revoked',
  'course_enrollment', 'course_unenrollment',
  'learning_path_enrollment', 'learning_path_updated', 'learning_path_completion',
  'event_session_creation', 'event_session_updated', 'event_session_canceled',
  'learning_journey_enrollment', 'learning_journey_completion', 'learning_journey_blocked',
  'learning_journey_deleted', 'learning_journey_archived',
];

beforeAll(() => {
  process.env.LEARNUPON_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => seenWebhookIds.clear());

// Based on the sample course_enrollment webhook in the LearnUpon docs.
function samplePayload() {
  return {
    data: [
      {
        eventCreated: '2023-12-14T19:41:35.463Z',
        user: { userId: 285900, email: 'bella.bell@yourdomain.com', username: null },
        enrollmentId: 18976600,
        dueDate: null,
        courseId: 2712800,
        wasRecertified: false,
      },
    ],
  };
}

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

let counter = 0;
function makeRequest(
  body: string = JSON.stringify(samplePayload()),
  opts: { signature?: string | null; type?: string; id?: string; contentType?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-webhook-type': opts.type ?? 'course_enrollment',
    'x-webhook-id': opts.id ?? `wh-${++counter}`,
  };
  const sig = opts.signature === undefined ? sign(body) : opts.signature;
  if (sig !== null) headers['x-webhook-signature'] = sig;
  return new NextRequest('http://localhost:3000/webhooks/learnupon', { method: 'POST', headers, body });
}

describe('POST /webhooks/learnupon', () => {
  describe('signature verification', () => {
    it('accepts the published test vector from the LearnUpon docs', () => {
      expect(verifyLearnuponSignature(Buffer.from(VECTOR.body, 'utf8'), VECTOR.signature, VECTOR.secret)).toBe(true);
    });

    it('accepts the test vector over HTTP with its secret', async () => {
      process.env.LEARNUPON_WEBHOOK_SECRET = VECTOR.secret;
      try {
        const res = await POST(makeRequest(VECTOR.body, { signature: VECTOR.signature }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      } finally {
        process.env.LEARNUPON_WEBHOOK_SECRET = SECRET;
      }
    });

    it('rejects the test vector with a different secret', () => {
      expect(verifyLearnuponSignature(Buffer.from(VECTOR.body, 'utf8'), VECTOR.signature, 'other-secret')).toBe(false);
    });

    it('accepts a valid signature', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body, { signature: sign(body).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('accepts any content type (raw body)', async () => {
      const res = await POST(makeRequest(JSON.stringify(samplePayload()), { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      expect((await POST(makeRequest(undefined, { signature: null }))).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await POST(makeRequest(undefined, { signature: '' }))).status).toBe(401);
    });

    it('rejects a signature of the wrong length without throwing', async () => {
      expect((await POST(makeRequest(undefined, { signature: 'abcd' }))).status).toBe(401);
    });

    it('rejects non-hex characters in a 64-character signature', async () => {
      expect((await POST(makeRequest(undefined, { signature: 'z'.repeat(64) }))).status).toBe(401);
    });

    it('rejects a prefixed signature (the header is the bare digest)', async () => {
      const body = JSON.stringify(samplePayload());
      expect((await POST(makeRequest(body, { signature: `sha256=${sign(body)}` }))).status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = JSON.stringify(samplePayload());
      expect((await POST(makeRequest(body, { signature: sign(body, 'wrong_secret') }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await POST(makeRequest(body.replace('18976600', '18976601'), { signature: sign(body) }));
      expect(res.status).toBe(401);
    });

    it('verifies the exact bytes, not re-serialised JSON', async () => {
      const pretty = JSON.stringify(samplePayload(), null, 2);
      expect((await POST(makeRequest(pretty))).status).toBe(200);
      const res = await POST(makeRequest(pretty, { signature: sign(JSON.stringify(samplePayload())) }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const body = Buffer.from(JSON.stringify(samplePayload()));
      const sig = sign(body.toString());
      expect(verifyLearnuponSignature(body, sig, '')).toBe(false);
      delete process.env.LEARNUPON_WEBHOOK_SECRET;
      expect(verifyLearnuponSignature(body, sig)).toBe(false);
      process.env.LEARNUPON_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('returns 400 for invalid JSON after verifying', async () => {
      expect((await POST(makeRequest('{not json'))).status).toBe(400);
    });

    it('returns 400 when data is not an array', async () => {
      expect((await POST(makeRequest('{"data":{}}'))).status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a valid signature', async () => {
      expect((await POST(makeRequest('{not json', { signature: null }))).status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(JSON.stringify(samplePayload()), { type }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(undefined, { type: 'something_new' }));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('loops over every item in data', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const payload = samplePayload();
      payload.data.push({ ...payload.data[0], courseId: 99 });
      const res = await POST(makeRequest(JSON.stringify(payload)));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Course enrollment')).length).toBe(2);
      spy.mockRestore();
    });

    it('dedupes retried deliveries on X-Webhook-ID', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const first = await POST(makeRequest(undefined, { id: 'same-id' }));
      const retry = await POST(makeRequest(undefined, { id: 'same-id' }));
      expect(await first.json()).toEqual({ received: true });
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Course enrollment')).length).toBe(1);
      spy.mockRestore();
    });
  });
});
