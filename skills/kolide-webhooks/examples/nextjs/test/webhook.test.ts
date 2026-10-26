import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Any string works: the signing secret is used as-is as UTF-8 key bytes. Test value only.
const SECRET = 'test_kolide_signing_secret';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.KOLIDE_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/kolide/route'));
});

afterEach(() => {
  process.env.KOLIDE_WEBHOOK_SECRET = SECRET;
  logSpy.mockClear();
});

// Bodies follow the sample payloads in Kolide's docs.
const payloads = {
  deviceCreated: {
    event: 'devices.created',
    id: '01HDVY8MA3CQ48HJ356FP8M2P6',
    timestamp: '2023-10-28T20:05:33Z',
    data: { device_id: 1, device_name: 'Jasons-MacBook-Pro' },
  },
  issueNew: {
    event: 'issues.new',
    id: '01HDW0TFR12Q0DJFVY7Y0DBQ0N',
    timestamp: '2023-10-28T20:50:15Z',
    data: {
      issue_id: 2,
      title: null,
      check_id: 71,
      device: { id: 1, name: 'Jasons-MacBook-Pro-2' },
      check: { id: 71, name: 'macOS Firewall - Require macOS Firewall is Enabled', tags: [] },
    },
  },
  statusChanged: {
    event: 'device_trust.status_changed',
    id: '01J7EXHMF0FCA14EW04JASYCRP',
    timestamp: '2024-09-10T21:30:59Z',
    data: { device_id: 9, device_name: 'Matts-Kolide-MacBook-Pro', device_status: 'blocked', device_url: 'https://api.kolide.com/devices/9' },
  },
  test: {
    event: 'webhook.test',
    id: '01HDVY6MBEYST7797YFFH6QK7C',
    timestamp: '2023-10-28T20:04:28Z',
    data: { message: 'This is a test webhook event' },
  },
};

// The Authorization header is the bare lowercase hex digest of the raw body
function sign(body: string, secret: string | Buffer = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, authorization?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (authorization !== undefined) headers['authorization'] = authorization;
  return POST(new NextRequest('http://localhost:3000/webhooks/kolide', { method: 'POST', headers, body }));
}

describe('Kolide webhook signature verification', () => {
  it('accepts a valid bare-hex Authorization header', async () => {
    const body = JSON.stringify(payloads.deviceCreated);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    const body = JSON.stringify(payloads.deviceCreated);
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = '{ "event" : "webhook.test",\n  "id": "x", "data": {} }';
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(JSON.stringify(JSON.parse(body))))).status).toBe(401);
  });

  it('accepts uppercase hex', async () => {
    const body = JSON.stringify(payloads.test);
    expect((await post(body, sign(body).toUpperCase())).status).toBe(200);
  });

  it('uses the secret as UTF-8 bytes, not decoded', async () => {
    const body = JSON.stringify(payloads.test);
    const hexSecret = crypto.randomBytes(16).toString('hex');
    process.env.KOLIDE_WEBHOOK_SECRET = hexSecret;
    expect((await post(body, sign(body, hexSecret))).status).toBe(200);
    expect((await post(body, sign(body, Buffer.from(hexSecret, 'hex')))).status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(JSON.stringify(payloads.test))).status).toBe(401);
  });

  it('rejects an empty Authorization header', async () => {
    expect((await post(JSON.stringify(payloads.test), '')).status).toBe(401);
  });

  it('rejects a Bearer-prefixed value', async () => {
    const body = JSON.stringify(payloads.test);
    expect((await post(body, `Bearer ${sign(body)}`)).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(payloads.test);
    expect((await post(body, sign(body, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(payloads.deviceCreated);
    const tampered = JSON.stringify({ ...payloads.deviceCreated, data: { device_id: 2 } });
    expect((await post(tampered, sign(body))).status).toBe(401);
  });

  it('rejects malformed hex without decoding it', async () => {
    const body = JSON.stringify(payloads.test);
    const good = sign(body);
    expect((await post(body, good.slice(0, 63))).status).toBe(401); // too short
    expect((await post(body, `${good}00`)).status).toBe(401); // too long
    expect((await post(body, `${good.slice(0, 62)}zz`)).status).toBe(401); // bad alphabet
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.KOLIDE_WEBHOOK_SECRET;
    const body = JSON.stringify(payloads.test);
    expect((await post(body, sign(body))).status).toBe(500);
  });
});

describe('Kolide event handling', () => {
  const send = (payload: unknown) => {
    const body = JSON.stringify(payload);
    return post(body, sign(body));
  };

  it.each([
    ['devices.created', payloads.deviceCreated, 'Device created: Jasons-MacBook-Pro (id 1)'],
    ['issues.new', payloads.issueNew, 'issues.new: macOS Firewall - Require macOS Firewall is Enabled on Jasons-MacBook-Pro-2'],
    ['device_trust.status_changed', payloads.statusChanged, 'Device Matts-Kolide-MacBook-Pro is now blocked'],
    ['webhook.test', payloads.test, 'Test webhook received'],
  ])('handles %s', async (_name, payload, expected) => {
    expect((await send(payload)).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expected);
  });

  it('logs unhandled documented events and returns 200', async () => {
    const res = await send({ event: 'admin_users.created', id: '01HDW1V4TDE1B3KCAMR8V7Z4S5', data: { user_id: 1 } });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: admin_users.created');
  });

  it('ignores wrong-typed nested fields instead of failing', async () => {
    expect((await send({ event: 'issues.new', id: 'x', data: { device: 'nope', check: [1] } })).status).toBe(200);
    expect((await send({ event: 'devices.registered', id: 'x', data: 'not an object' })).status).toBe(200);
  });

  it('answers 400 for a signed body that is not a JSON object with an event', async () => {
    for (const body of ['not json', '[]', 'null', '"str"', JSON.stringify({ event: 5 }), JSON.stringify({ id: 'x' })]) {
      expect((await post(body, sign(body))).status).toBe(400);
    }
  });
});
