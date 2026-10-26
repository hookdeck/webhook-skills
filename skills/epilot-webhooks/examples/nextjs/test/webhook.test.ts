// Generated with: epilot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/epilot/route';

// epilot secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('epilot-test-signing-key-0123456').toString('base64');

/** The v1 (symmetric HMAC-SHA256) entry, exactly as epilot signs it. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

// epilot sends the Ed25519 entry first: "v1a,<asymmetric> v1,<symmetric>".
const V1A = `v1a,${crypto.randomBytes(64).toString('base64')}`;

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  prefix?: 'webhook' | 'svix';
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  const prefix = opts.prefix ?? 'webhook';
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? `${V1A} ${sign(rawBody, id, ts, opts.secret)}`,
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/epilot', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const automationTrigger = () => ({
  metadata: {
    webhook_id: 'wh_123',
    organization_id: '739224',
    event_type: 'automation_trigger_webhook',
    correlation_id: 'c0ffee',
  },
  entity: { _id: 'e1', _schema_: 'opportunity', name: 'New Opportunity', status: 'open' },
  relations: [],
  changed_attributes: { added: {}, deleted: {}, updated: {} },
});

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.EPILOT_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts automation_trigger_webhook with the v1a + v1 header epilot sends', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Automation trigger: opportunity e1'));
  });

  it('accepts customer_request_created', async () => {
    const payload = automationTrigger();
    payload.metadata.event_type = 'customer_request_created';
    const body = JSON.stringify(payload);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Customer request created'));
  });

  it('accepts a FileCreated Event Catalog payload', async () => {
    const body = JSON.stringify({
      _event_name: 'FileCreated',
      _org_id: '739224',
      event_attachments: [{ entity_id: 'f1', filename: 'invoice.pdf', version_index: 0 }],
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('invoice.pdf'));
  });

  it('acknowledges unknown event names with 200', async () => {
    const payload = automationTrigger();
    payload.metadata.event_type = 'event_SomethingNew';
    const body = JSON.stringify(payload);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled epilot event'));
  });

  it('accepts a v1-only signature header', async () => {
    const body = JSON.stringify(automationTrigger());
    const id = 'msg_v1only';
    const ts = String(now());
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: sign(body, id, ts) }));
    expect(res.status).toBe(200);
  });

  it('accepts any of several v1 entries (rotation)', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('verifies any content type, because the raw bytes are what is signed', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('prefers webhook-* headers when both sets are present', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = {
      ...signedHeaders(body),
      'svix-id': 'msg_other',
      'svix-timestamp': String(now()),
      'svix-signature': 'v1,aW52YWxpZA==',
    };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(automationTrigger());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad v1 signature', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { signature: `${V1A} v1,aW52YWxpZA==` }));
    expect(res.status).toBe(400);
  });

  it('rejects a delivery that carries only the v1a signature', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { signature: V1A }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-012345678').toString('base64');
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(automationTrigger());
    const headers = signedHeaders(body);
    const res = await post(body.replace('open', 'won'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the library 5-minute tolerance', async () => {
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(automationTrigger());
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

describe('other HTTP methods', () => {
  const OTHER_SECRET = 'whsec_' + Buffer.from('another-webhook-key').toString('base64');
  const send = (handler: (r: Request) => Promise<Response>, method: string, body: string | undefined, headers: Record<string, string>) =>
    handler(new Request('http://localhost:3000/webhooks/epilot', { method, headers, body }));

  it.each([
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)('verifies and handles %s', async (method, handler) => {
    const body = JSON.stringify(automationTrigger());
    expect((await send(handler, method, body, signedHeaders(body))).status).toBe(200);
    expect((await send(handler, method, body, signedHeaders(body, { secret: OTHER_SECRET }))).status).toBe(400);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    expect((await send(GET, 'GET', undefined, signedHeaders(''))).status).toBe(200);
    expect((await send(GET, 'GET', undefined, signedHeaders('x'))).status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when EPILOT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.EPILOT_WEBHOOK_SECRET;
    const body = JSON.stringify(automationTrigger());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
