// Generated with: bird-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/bird/route';

// Bird secrets look like "whsec_" + base64(key bytes), for example
// "whsec_c+dgRBsFELJ9mR4tu2cyhK0gTMMkqntv". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('bird-test-signing-key-0123456789').toString('base64');

/** Sign exactly like a Standard Webhooks sender (Bird). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': opts.contentType || 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/bird', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const event = (type: string, data: Record<string, unknown>) => ({
  type,
  timestamp: '2026-06-10T14:30:00Z',
  data,
});

const emailData = (extra: Record<string, unknown> = {}) => ({
  email_id: 'em_01krdgeqcxet5s7t44vh8rt9mg',
  recipient_id: 'er_01krdgeqcxet5s7t44vh8rt9mg',
  workspace_id: 'ws_01krdgeqcxet5s7t44vh8rt9mg',
  recipient: 'user@example.com',
  recipient_role: 'to',
  tags: [{ name: 'category', value: 'welcome' }],
  metadata: { order_id: 'ord_123' },
  broadcast_id: null,
  ...extra,
});

const emailDelivered = () => event('email.delivered', emailData());

beforeEach(() => {
  process.env.BIRD_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts email.delivered', async () => {
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Email delivered'));
  });

  it('accepts email.bounced', async () => {
    const body = JSON.stringify(
      event(
        'email.bounced',
        emailData({ bounce_type: 'hard', bounce_class: '10', bounce_code: 550, bounce_description: 'No such user', sending_ip: '192.0.2.1' })
      )
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Email bounced'));
  });

  it('accepts whatsapp.received', async () => {
    const body = JSON.stringify(
      event('whatsapp.received', {
        direction: 'inbound',
        from: { display_name: 'Alex Rivera', phone_number: '+14155550100', username: 'alexr' },
        to: { phone_number: '+13124495569' },
        whatsapp_id: 'wam_01ky8b3xq4gd7pmzn2ka51f7te',
        workspace_id: 'ws_01ky7m235keycbnwyajabe1a6b',
        metadata: null,
        tags: null,
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('+14155550100'));
  });

  it('accepts preference.granted', async () => {
    const body = JSON.stringify(
      event('preference.granted', {
        preference_id: 'prf_01krdgeqcxet5s7t44vh8rt9mg',
        transition_id: 'prt_01krdgeqcxet5s7t44vh8rt9mg',
        channel: 'sms',
        handle: '+15550001234',
        sender_scope: null,
        topic_id: null,
        coverage: 'non_transactional',
        contact_id: null,
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('preference.granted: sms'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('something.new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies whatever Content-Type the request carries', async () => {
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches (rotation)', async () => {
    const body = JSON.stringify(emailDelivered());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(emailDelivered());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(emailDelivered());
    const headers = signedHeaders(body);
    const res = await post(body.replace('user@example.com', 'evil@example.com'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(emailDelivered());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BIRD_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BIRD_WEBHOOK_SECRET;
    const body = JSON.stringify(emailDelivered());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
