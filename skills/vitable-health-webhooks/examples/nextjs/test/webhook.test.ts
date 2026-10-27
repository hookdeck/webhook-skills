import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Subscription secret keys are used as UTF-8 bytes
const SECRET = 'test_vitable_secret_Zq81xKd2';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.VITABLE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/vitable-health/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS;
  process.env.VITABLE_WEBHOOK_SECRET = SECRET;
});
afterEach(() => vi.restoreAllMocks());

function digest(timestamp: string | number, body: string, secret: string | Buffer = SECRET): string {
  return crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(String(timestamp), 'latin1'))
    .update('.')
    .update(Buffer.from(body))
    .digest('hex');
}

function headersFor(
  body: string,
  { timestamp = Math.floor(Date.now() / 1000) as string | number, secret = SECRET as string | Buffer, prefix = 'sha512=' } = {}
): Record<string, string> {
  return {
    'X-Vitable-Signature': `${prefix}${digest(timestamp, body, secret)}`,
    'X-Vitable-Timestamp': String(timestamp),
  };
}

function post(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/vitable-health', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

let counter = 0;
// Each event gets a fresh event_id, because the handler deduplicates on it
function eventBody(overrides: Record<string, unknown> = {}): string {
  counter += 1;
  return JSON.stringify({
    event_id: `wevt_550e8400-e29b-41d4-a716-${String(counter).padStart(12, '0')}`,
    organization_id: 'org_xyz789',
    event_name: 'enrollment.accepted',
    resource_type: 'enrollment',
    resource_id: 'enrl_7c9e6679-7425-40de-944b-e07fc1f90ae7',
    created_at: '2026-01-23T14:30:00+00:00',
    ...overrides,
  });
}

describe('Vitable Health webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid sha512= signature', async () => {
      const body = eventBody();
      const res = await post(body, headersFor(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the bare digest without the sha512= prefix', async () => {
      const body = eventBody();
      const res = await post(body, headersFor(body, { prefix: '' }));
      expect(res.status).toBe(200);
    });

    it('accepts uppercase hex', async () => {
      const body = eventBody();
      const h = headersFor(body);
      h['X-Vitable-Signature'] = 'sha512=' + h['X-Vitable-Signature'].slice(7).toUpperCase();
      expect((await post(body, h)).status).toBe(200);
    });

    it('verifies any content type because the body is read raw', async () => {
      const body = eventBody();
      expect((await post(body, headersFor(body), 'text/plain')).status).toBe(200);
    });

    it('verifies the exact bytes, including whitespace and non-ASCII characters', async () => {
      const body = '{ "event_id" : "wevt_raw_bytes_1",\n  "event_name": "employee.deactivated", "note": "café ✓" }';
      expect((await post(body, headersFor(body))).status).toBe(200);
    });

    it('rejects a re-serialized body', async () => {
      const body = '{ "event_id" : "wevt_raw_bytes_2", "event_name": "employee.deactivated" }';
      const res = await post(JSON.stringify(JSON.parse(body)), headersFor(body));
      expect(res.status).toBe(401);
    });

    it('uses the secret as UTF-8, not hex- or base64-decoded', async () => {
      const body = eventBody();
      const hexLooking = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      process.env.VITABLE_WEBHOOK_SECRET = hexLooking;
      expect((await post(body, headersFor(body, { secret: hexLooking }))).status).toBe(200);
      const decoded = await post(body, headersFor(body, { secret: Buffer.from(hexLooking, 'hex') }));
      expect(decoded.status).toBe(401);
    });

    it('rejects a wrong secret', async () => {
      const body = eventBody();
      expect((await post(body, headersFor(body, { secret: 'another_subscription_secret' }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = eventBody();
      const res = await post(body.replace('enrollment.accepted', 'enrollment.terminated'), headersFor(body));
      expect(res.status).toBe(401);
    });

    it('rejects a signature made over a different timestamp', async () => {
      const body = eventBody();
      const h = headersFor(body);
      h['X-Vitable-Timestamp'] = String(Number(h['X-Vitable-Timestamp']) + 1);
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing signature header', async () => {
      const body = eventBody();
      const h = headersFor(body);
      delete h['X-Vitable-Signature'];
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing timestamp header', async () => {
      const body = eventBody();
      const h = headersFor(body);
      delete h['X-Vitable-Timestamp'];
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const body = eventBody();
      const h = { ...headersFor(body), 'X-Vitable-Signature': '' };
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects malformed signatures', async () => {
      const body = eventBody();
      const now = Math.floor(Date.now() / 1000);
      const good = digest(now, body);
      const bad = [
        'sha512=',
        'sha512=' + good.slice(0, 127), // too short
        'sha512=' + good + '0', // too long
        'sha512=' + 'zz' + good.slice(2), // not hex
        'sha512=' + good.slice(0, 126) + '  ', // spaces in place of hex
        'sha256=' + good, // wrong prefix
        crypto.createHmac('sha256', SECRET).update('x').digest('hex'), // SHA-256 length
      ];
      for (const signature of bad) {
        const res = await post(body, { 'X-Vitable-Timestamp': String(now), 'X-Vitable-Signature': signature });
        expect(res.status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.VITABLE_WEBHOOK_SECRET;
      const body = eventBody();
      expect((await post(body, headersFor(body))).status).toBe(500);
    });
  });

  describe('timestamp window (opt-in)', () => {
    const old = () => Math.floor(Date.now() / 1000) - 3600;

    it('does not reject old timestamps by default, so retries and replays verify', async () => {
      const body = eventBody();
      expect((await post(body, headersFor(body, { timestamp: old() }))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = eventBody();
      expect((await post(body, headersFor(body, { timestamp: old() }))).status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', async () => {
      process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = eventBody();
      expect((await post(body, headersFor(body, { timestamp: old() }))).status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set', async () => {
      process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = eventBody();
      expect((await post(body, headersFor(body))).status).toBe(200);
    });

    it('rejects a non-integer timestamp when a tolerance is set', async () => {
      process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = eventBody();
      expect((await post(body, headersFor(body, { timestamp: '1.5e9' }))).status).toBe(401);
    });
  });

  describe('event handling', () => {
    const cases: [string, string][] = [
      ['enrollment.accepted', 'Enrollment accepted'],
      ['enrollment.terminated', 'Enrollment terminated'],
      ['employee.eligibility_granted', 'Employee eligibility granted'],
      ['employee.eligibility_terminated', 'Employee eligibility terminated'],
      ['employee.deduction_created', 'Payroll deduction created'],
    ];
    it.each(cases)('handles %s', async (name, message) => {
      const body = eventBody({ event_name: name });
      const res = await post(body, headersFor(body));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(message));
    });

    it.each(['enrollment.elected', 'enrollment.granted', 'enrollment.waived', 'enrollment.started', 'employee.deactivated', 'employee.future_event'])(
      'logs %s as unhandled and acknowledges it',
      async (name) => {
        const body = eventBody({ event_name: name });
        expect((await post(body, headersFor(body))).status).toBe(200);
        expect(logSpy).toHaveBeenCalledWith(`Unhandled event: ${name}`);
      }
    );

    it('processes a redelivered event_id only once', async () => {
      const body = eventBody();
      const first = await post(body, headersFor(body));
      expect(await first.json()).toEqual({ received: true });
      const second = await post(body, headersFor(body));
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(logSpy.mock.calls.filter(([m]) => String(m).startsWith('Enrollment accepted'))).toHaveLength(1);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const body = 'not json';
      expect((await post(body, headersFor(body), 'text/plain')).status).toBe(400);
    });
  });
});
