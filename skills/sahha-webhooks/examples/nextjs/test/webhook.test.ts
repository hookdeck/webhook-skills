// Generated with: sahha-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/sahha/route';

// Any string from the Sahha Dashboard; it is used as UTF-8 bytes, not decoded.
const SECRET = 'sahha_test_secret_key_123';

/** Sign exactly like Sahha: lowercase hex HMAC-SHA256 of the raw body, no prefix. */
function sign(rawBody: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

interface Options {
  eventType?: string | null;
  signature?: string | null;
  contentType?: string;
}

function makeRequest(rawBody: string, opts: Options = {}): Request {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-external-id': 'user_12345',
  };
  if (opts.eventType !== null) headers['x-event-type'] = opts.eventType ?? 'ScoreCreatedIntegrationEvent';
  if (opts.signature !== null) headers['x-signature'] = opts.signature ?? sign(rawBody);
  return new Request('http://localhost:3000/webhooks/sahha', { method: 'POST', headers, body: rawBody });
}

const events: Record<string, object> = {
  ScoreCreatedIntegrationEvent: { id: 's1', externalId: 'user_12345', type: 'sleep', state: 'high', score: 0.85 },
  BiomarkerCreatedIntegrationEvent: { id: 'b1', externalId: 'user_12345', type: 'steps', value: '8547', unit: 'count' },
  ArchetypeCreatedIntegrationEvent: { id: 'a1', externalId: 'user_12345', name: 'chronotype', value: 'early_bird' },
  TagReceivedIntegrationEvent: { id: 't1', externalId: 'user_12345', type: 'state', name: 'night_shift', value: null },
  DataLogReceivedIntegrationEvent: { logType: 'activity', dataType: 'steps', dataLogs: [{ id: 'd1', value: 1250 }] },
};

describe('Sahha webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SAHHA_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('valid signatures', () => {
    for (const [eventType, payload] of Object.entries(events)) {
      it(`accepts ${eventType}`, async () => {
        const res = await POST(makeRequest(JSON.stringify(payload), { eventType }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
        expect(logSpy).toHaveBeenCalled();
      });
    }

    it('accepts an uppercase hex signature (compared case-insensitively)', async () => {
      const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);
      const res = await POST(makeRequest(body, { signature: sign(body).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, including whitespace and non-ASCII', async () => {
      const body = '{ "type" :  "sleep",\n "note": "café ✓" }';
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);
      const res = await POST(makeRequest(body, { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('logs unknown event types and still returns 200', async () => {
      const res = await POST(makeRequest('{}', { eventType: 'SomethingNewIntegrationEvent' }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Sahha event type: SomethingNewIntegrationEvent');
    });
  });

  describe('invalid signatures', () => {
    const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);

    it('rejects a missing signature with 401', async () => {
      const res = await POST(makeRequest(body, { signature: null }));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature with 401', async () => {
      const res = await POST(makeRequest(body, { signature: '' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature signed with the wrong secret', async () => {
      const res = await POST(makeRequest(body, { signature: sign(body, 'wrong_secret') }));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await POST(makeRequest(body.replace('0.85', '0.99'), { signature: sign(body) }));
      expect(res.status).toBe(401);
    });

    it('rejects wrong-length and non-hex signatures', async () => {
      for (const signature of [
        sign(body).slice(0, 62),
        sign(body) + 'ab',
        'z'.repeat(64),
        'sha256=' + sign(body),
      ]) {
        const res = await POST(makeRequest(body, { signature }));
        expect(res.status).toBe(401);
      }
    });

    it('does not accept a signature over a parsed-and-reserialized body', async () => {
      const raw = '{"a": 1}';
      const res = await POST(makeRequest(raw, { signature: sign(JSON.stringify(JSON.parse(raw))) }));
      expect(res.status).toBe(401);
    });
  });

  describe('after verification', () => {
    it('returns 400 for non-JSON bodies', async () => {
      const res = await POST(makeRequest('not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for JSON that is not an object', async () => {
      for (const body of ['[]', '"x"', '42', 'null']) {
        const res = await POST(makeRequest(body));
        expect(res.status).toBe(400);
      }
    });

    it('returns 400 when X-Event-Type is missing', async () => {
      const res = await POST(makeRequest('{}', { eventType: null }));
      expect(res.status).toBe(400);
    });

    it('ignores wrong-typed fields instead of failing with 500', async () => {
      const cases: [string, unknown][] = [
        ['ScoreCreatedIntegrationEvent', { type: 5, state: {}, score: 'x' }],
        ['BiomarkerCreatedIntegrationEvent', { type: [], value: 1, unit: null }],
        ['ArchetypeCreatedIntegrationEvent', { name: {}, value: [] }],
        ['TagReceivedIntegrationEvent', { name: 1, type: null }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: 'nope' }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: [1, null, 'x', []] }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: { a: 1 }, dataType: 7 }],
      ];
      for (const [eventType, payload] of cases) {
        const res = await POST(makeRequest(JSON.stringify(payload), { eventType }));
        expect(res.status).toBe(200);
      }
    });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.SAHHA_WEBHOOK_SECRET;
    const res = await POST(makeRequest(JSON.stringify(events.ScoreCreatedIntegrationEvent)));
    expect(res.status).toBe(500);
  });
});
