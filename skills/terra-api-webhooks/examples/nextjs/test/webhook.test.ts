import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Terra signing secrets are used as UTF-8 bytes as-is; this one is only for tests
const SECRET = 'test_terra_secret_5f0c1a7e';
const OTHER_SECRET = 'rotated_terra_secret_9d2b4c8f';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.TERRA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/terra-api/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.TERRA_WEBHOOK_TOLERANCE_SECONDS;
  process.env.TERRA_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

// terra-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
function mac(body: string, timestamp: number | string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(
  body: string,
  { timestamp = now(), secret = SECRET }: { timestamp?: number; secret?: string } = {}
): string {
  return `t=${timestamp},v1=${mac(body, timestamp, secret)}`;
}

function event(type: string): string {
  return JSON.stringify({
    type,
    status: 'success',
    user: { user_id: 'a1b2c3d4-0000-4000-8000-000000000001', provider: 'FITBIT', reference_id: 'u_42' },
    data: [],
  });
}

function post(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/terra-api', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

describe('Terra webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = event('activity');
      const res = await post(body, { 'terra-signature': sign(body) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts any matching v1 and ignores v0 and unknown keys', async () => {
      const body = event('sleep');
      const t = now();
      const header = `t=${t},v0=${'0'.repeat(64)},v1=${mac(body, t, OTHER_SECRET)},v1=${mac(body, t)},x=1`;
      expect((await post(body, { 'terra-signature': header })).status).toBe(200);
    });

    it('rejects a header carrying only v0', async () => {
      const body = event('activity');
      const t = now();
      expect((await post(body, { 'terra-signature': `t=${t},v0=${mac(body, t)}` })).status).toBe(401);
    });

    it('accepts uppercase hex', async () => {
      const body = event('body');
      const t = now();
      expect((await post(body, { 'terra-signature': `t=${t},v1=${mac(body, t).toUpperCase()}` })).status).toBe(200);
    });

    it('verifies the exact bytes (non-canonical JSON, multibyte characters)', async () => {
      const body = '{ "type" : "activity",\n  "user": {"user_id": "é-✓"} }';
      expect((await post(body, { 'terra-signature': sign(body) })).status).toBe(200);
    });

    it('verifies a body sent with an unusual content type', async () => {
      const body = event('daily');
      const res = await post(body, { 'terra-signature': sign(body) }, 'text/plain');
      expect(res.status).toBe(200);
    });

    it('uses the t value exactly as sent (no number round-trip)', async () => {
      const body = event('activity');
      const t = '0001723808700';
      expect((await post(body, { 'terra-signature': `t=${t},v1=${mac(body, t)}` })).status).toBe(200);
    });

    it('rejects a wrong secret', async () => {
      const body = event('activity');
      expect((await post(body, { 'terra-signature': sign(body, { secret: OTHER_SECRET }) })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = event('activity');
      const res = await post(body.replace('FITBIT', 'GARMIN'), { 'terra-signature': sign(body) });
      expect(res.status).toBe(401);
    });

    it('rejects a missing or empty header', async () => {
      const body = event('activity');
      expect((await post(body)).status).toBe(401);
      expect((await post(body, { 'terra-signature': '' })).status).toBe(401);
    });

    it('rejects a header with no t value', async () => {
      const body = event('activity');
      expect((await post(body, { 'terra-signature': `v1=${mac(body, 1723808700)}` })).status).toBe(401);
      expect((await post(body, { 'terra-signature': `t=,v1=${mac(body, '')}` })).status).toBe(401);
    });

    it('rejects malformed v1 values without decoding them', async () => {
      const body = event('activity');
      const t = now();
      const good = mac(body, t);
      for (const bad of [good.slice(0, 62), good + '00', `zz${good.slice(2)}`, `${good.slice(0, 62)}!!`, '']) {
        expect((await post(body, { 'terra-signature': `t=${t},v1=${bad}` })).status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.TERRA_WEBHOOK_SECRET;
      const body = event('activity');
      expect((await post(body, { 'terra-signature': sign(body) })).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    it('does not reject old timestamps by default', async () => {
      const body = event('activity');
      const res = await post(body, { 'terra-signature': sign(body, { timestamp: now() - 86400 }) });
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when TERRA_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.TERRA_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('activity');
      expect((await post(body, { 'terra-signature': sign(body, { timestamp: now() - 3600 }) })).status).toBe(401);
      expect((await post(body, { 'terra-signature': sign(body) })).status).toBe(200);
    });

    it('treats 0 and non-numeric values as off', async () => {
      const body = event('activity');
      const old = sign(body, { timestamp: now() - 86400 });
      process.env.TERRA_WEBHOOK_TOLERANCE_SECONDS = '0';
      expect((await post(body, { 'terra-signature': old })).status).toBe(200);
      process.env.TERRA_WEBHOOK_TOLERANCE_SECONDS = 'soon';
      expect((await post(body, { 'terra-signature': old })).status).toBe(200);
    });
  });

  describe('event handling', () => {
    it.each(['auth', 'deauth', 'user_reauth', 'access_revoked', 'connection_error', 'activity', 'sleep', 'body', 'daily', 'athlete'])(
      'handles %s',
      async (type) => {
        const body = event(type);
        const res = await post(body, { 'terra-signature': sign(body) });
        expect(res.status).toBe(200);
        expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
      }
    );

    it('logs unknown event types and still returns 200', async () => {
      const body = event('rate_limit_hit');
      const res = await post(body, { 'terra-signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled event: rate_limit_hit');
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      expect((await post(body, { 'terra-signature': sign(body) })).status).toBe(400);
    });
  });
});
