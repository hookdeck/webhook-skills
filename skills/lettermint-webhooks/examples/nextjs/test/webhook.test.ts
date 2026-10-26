import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyLettermintWebhook } from '../lib/lettermint';

// Lettermint secrets look like whsec_... and are used whole, as a plain UTF-8 HMAC key
const SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2xldHRlcm1pbnQ';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.LETTERMINT_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/lettermint/route'));
});

const now = () => Math.floor(Date.now() / 1000);

function v1(body: string | Uint8Array, secret = SECRET, t = String(now())): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${t}.`), Buffer.from(body)]))
    .digest('hex');
}
function sign(body: string | Uint8Array, secret = SECRET, t = String(now())): string {
  return `t=${t},v1=${v1(body, secret, t)}`;
}

// Payloads based on the sample payloads in Lettermint's webhook events documentation
const envelope = (event: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: '9b0c4a4e-4e29-4d8b-8b3a-3f0f3e6d2f9b',
  event,
  timestamp: '2025-08-08T20:15:12.000Z',
  ...extra,
  data,
});
const messageData = {
  message_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  subject: 'Your order has shipped',
  recipient: 'user@example.com',
  metadata: { 'X-Transaction-ID': 'txn-456' },
  tag: 'order-confirmation',
  tags: [{ name: '__lettermint_tag', value: 'order-confirmation' }],
};
const samples: Record<string, unknown> = {
  'message.delivered': envelope(
    'message.delivered',
    { ...messageData, response: { status_code: 250, enhanced_status_code: '2.0.0', content: 'OK  1640705112 qp1355551phe.1 - gsmtp' } },
    { sandbox: false, sandbox_result: null }
  ),
  'message.hard_bounced': envelope('message.hard_bounced', messageData),
  'message.soft_bounced': envelope('message.soft_bounced', messageData),
  'message.spam_complaint': envelope('message.spam_complaint', messageData),
  'message.failed': envelope('message.failed', {
    ...messageData,
    reason: '5.7.10 Encryption needed: recipient did not offer STARTTLS',
    reason_code: 'enforced_tls_failed',
    response: { status_code: 550 },
  }),
  'suppression.added': envelope(
    'suppression.added',
    { suppression_id: '1d74d4c9-8492-4f5f-ae3f-f6fd671399ea', type: 'email', value: 'suppressed@example.com', reason: 'hard_bounce', applies_to: 'all' },
    { context: { scope: 'team', team_id: '9f4e3d2c-1b0a-4987-9654-3210fedcba98', project_id: null, route_id: null } }
  ),
  'webhook.test': envelope('webhook.test', {
    message: 'This is a test webhook from Lettermint',
    webhook_id: '9f9bf19c-4a2c-45f3-a6c7-bc937224ec5a',
    timestamp: 1754921294,
  }),
};

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header !== undefined) headers['x-lettermint-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/lettermint', { method: 'POST', headers, body });
}

describe('verifyLettermintWebhook', () => {
  const body = Buffer.from(JSON.stringify(samples['message.delivered']));

  it('accepts a valid signature', () => {
    expect(verifyLettermintWebhook(body, sign(body), SECRET, 0)).toBe(true);
  });

  it('uses the whole secret, including whsec_, as the key', () => {
    const t = String(now());
    const rest = SECRET.slice('whsec_'.length);
    const stripped = crypto.createHmac('sha256', rest).update(`${t}.`).update(body).digest('hex');
    const decoded = crypto.createHmac('sha256', Buffer.from(rest, 'base64')).update(`${t}.`).update(body).digest('hex');
    expect(verifyLettermintWebhook(body, `t=${t},v1=${stripped}`, SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(body, `t=${t},v1=${decoded}`, SECRET, 0)).toBe(false);
  });

  it('rejects a wrong secret and a tampered body', () => {
    expect(verifyLettermintWebhook(body, sign(body, 'whsec_other'), SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(Buffer.from('{"tampered":true}'), sign(body), SECRET, 0)).toBe(false);
  });

  it('rejects a header signed over a different t', () => {
    const header = `t=1700000001,v1=${v1(body, SECRET, '1700000000')}`;
    expect(verifyLettermintWebhook(body, header, SECRET, 0)).toBe(false);
  });

  it('rejects missing, empty, and t-less headers', () => {
    expect(verifyLettermintWebhook(body, null, SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(body, '', SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(body, `v1=${v1(body)}`, SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(body, `t=,v1=${v1(body)}`, SECRET, 0)).toBe(false);
  });

  it('rejects malformed v1 values without throwing', () => {
    const t = String(now());
    const good = v1(body, SECRET, t);
    for (const bad of ['', 'abc', 'z'.repeat(64), good.slice(0, 63), good + '0', `${good.slice(0, 62)}\n\n`, ` ${good}x`]) {
      expect(verifyLettermintWebhook(body, `t=${t},v1=${bad}`, SECRET, 0)).toBe(false);
    }
    expect(verifyLettermintWebhook(body, `t=${t}`, SECRET, 0)).toBe(false);
  });

  it('compares hex case-insensitively', () => {
    const t = String(now());
    expect(verifyLettermintWebhook(body, `t=${t},v1=${v1(body, SECRET, t).toUpperCase()}`, SECRET, 0)).toBe(true);
  });

  it('accepts when any of several v1 entries matches and ignores other keys', () => {
    const t = String(now());
    const good = v1(body, SECRET, t);
    const wrong = v1(body, 'whsec_old', t);
    expect(verifyLettermintWebhook(body, `t=${t},v1=${wrong},v1=${good}`, SECRET, 0)).toBe(true);
    expect(verifyLettermintWebhook(body, `t=${t},v1=${good},v1=${wrong}`, SECRET, 0)).toBe(true);
    expect(verifyLettermintWebhook(body, `t=${t},v0=${good}`, SECRET, 0)).toBe(false);
    expect(verifyLettermintWebhook(body, `t=${t},v0=deadbeef,v1=${good}`, SECRET, 0)).toBe(true);
  });

  it('verifies the exact bytes, not a re-serialized body', () => {
    const raw = Buffer.from('{ "id": "x",  "event": "message.delivered", "data": {"subject": "café https://a/b"} }', 'utf8');
    expect(verifyLettermintWebhook(raw, sign(raw), SECRET, 0)).toBe(true);
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))));
    expect(verifyLettermintWebhook(reserialized, sign(raw), SECRET, 0)).toBe(false);
    const binary = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]); // invalid UTF-8 stays byte-exact
    expect(verifyLettermintWebhook(binary, sign(binary), SECRET, 0)).toBe(true);
  });

  describe('timestamp window (opt-in)', () => {
    const t = 1_754_921_294;
    const header = sign(body, SECRET, String(t));

    it('is off by default: old timestamps pass (retries and replays keep the original t)', () => {
      expect(verifyLettermintWebhook(body, header, SECRET, 0, t + 86_400)).toBe(true);
    });

    it('rejects stale and future timestamps when on', () => {
      expect(verifyLettermintWebhook(body, header, SECRET, 300, t + 301)).toBe(false);
      expect(verifyLettermintWebhook(body, header, SECRET, 300, t - 301)).toBe(false);
    });

    it('accepts timestamps inside the window', () => {
      expect(verifyLettermintWebhook(body, header, SECRET, 300, t + 299)).toBe(true);
      expect(verifyLettermintWebhook(body, header, SECRET, 300, t - 299)).toBe(true);
    });

    it('requires a numeric t when on', () => {
      expect(verifyLettermintWebhook(body, sign(body, SECRET, 'abc'), SECRET, 300, t)).toBe(false);
    });

    it('reads LETTERMINT_WEBHOOK_TOLERANCE_SECONDS by default', () => {
      const old = sign(body, SECRET, '1700000000');
      process.env.LETTERMINT_WEBHOOK_TOLERANCE_SECONDS = '300';
      try {
        expect(verifyLettermintWebhook(body, old, SECRET)).toBe(false);
      } finally {
        delete process.env.LETTERMINT_WEBHOOK_TOLERANCE_SECONDS;
      }
      expect(verifyLettermintWebhook(body, old, SECRET)).toBe(true);
    });
  });
});

describe('POST /webhooks/lettermint', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(Object.keys(samples))('accepts a signed %s event', async (name) => {
    const body = JSON.stringify(samples[name]);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('logs and accepts events it does not handle', async () => {
    const body = JSON.stringify(envelope('message.clicked', messageData));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Unhandled event type: message.clicked');
  });

  it('verifies the bytes whatever the content type', async () => {
    const body = JSON.stringify(samples['message.delivered']);
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
    expect((await POST(makeRequest(body, sign(body), 'application/vnd.api+json'))).status).toBe(200);
  });

  it('accepts a body with spacing that JSON.stringify would change', async () => {
    const body = '{ "id": "x",  "event": "webhook.test", "data": {} }';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('returns 401 for a missing, empty, or malformed signature header', async () => {
    const body = JSON.stringify(samples['webhook.test']);
    expect((await POST(makeRequest(body))).status).toBe(401);
    expect((await POST(makeRequest(body, ''))).status).toBe(401);
    expect((await POST(makeRequest(body, 'garbage'))).status).toBe(401);
    expect((await POST(makeRequest(body, `t=${now()},v1=${'g'.repeat(64)}`))).status).toBe(401);
  });

  it('returns 401 for a wrong secret or tampered body', async () => {
    const body = JSON.stringify(samples['webhook.test']);
    expect((await POST(makeRequest(body, sign(body, 'whsec_other')))).status).toBe(401);
    expect((await POST(makeRequest(body + ' ', sign(body)))).status).toBe(401);
  });

  it('returns 400 for valid signature over invalid JSON', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.LETTERMINT_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(samples['webhook.test']);
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(500);
    } finally {
      process.env.LETTERMINT_WEBHOOK_SECRET = SECRET;
    }
  });
});
