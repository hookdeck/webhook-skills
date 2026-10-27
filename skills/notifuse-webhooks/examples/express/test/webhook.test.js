// Generated with: notifuse-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Notifuse secrets look like "whsec_" + base64(32 random bytes). The HMAC key
// is the decoded part.
const SECRET = 'whsec_' + Buffer.from('notifuse-test-signing-key-0123456').toString('base64');
process.env.NOTIFUSE_WEBHOOK_SECRET = SECRET;

const { app, verifyNotifuseWebhook } = require('../src/index');

/** Sign exactly like Notifuse does (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, opts = {}) {
  const prefix = opts.prefix || 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': opts.contentType || 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/notifuse').set(headers).send(rawBody);
}

const envelope = (type, data) => ({
  id: `delivery_${crypto.randomUUID().replace(/-/g, '')}`,
  type,
  timestamp: '2026-10-26T10:30:00Z',
  workspace_id: 'ws_1234567890',
  data,
});

const contact = { id: 'contact_12345', email: 'user@example.com', first_name: 'John' };
const emailData = { message_id: 'msg_xyz789', email: 'user@example.com', subject: 'Welcome' };
const segmentData = { email: 'user@example.com', contact_id: 'contact_12345', segment_id: 'seg_vip', segment_name: 'VIP' };

const EVENTS = {
  'contact.created': contact,
  'contact.updated': contact,
  'contact.deleted': contact,
  'list.subscribed': { email: 'user@example.com' },
  'list.unsubscribed': { email: 'user@example.com' },
  'list.confirmed': { email: 'user@example.com' },
  'list.resubscribed': { email: 'user@example.com' },
  'list.bounced': { email: 'user@example.com' },
  'list.complained': { email: 'user@example.com' },
  'list.pending': { email: 'user@example.com' },
  'list.removed': { email: 'user@example.com' },
  'segment.joined': segmentData,
  'segment.left': segmentData,
  'email.sent': emailData,
  'email.delivered': emailData,
  'email.opened': emailData,
  'email.clicked': emailData,
  'email.bounced': emailData,
  'email.complained': emailData,
  'email.unsubscribed': emailData,
  'custom_event.created': { event_name: 'orders/fulfilled' },
  'custom_event.updated': { event_name: 'orders/fulfilled' },
  'custom_event.deleted': { event_name: 'orders/fulfilled' },
};

describe('Notifuse webhook handler', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    process.env.NOTIFUSE_WEBHOOK_SECRET = SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('valid deliveries', () => {
    test.each(Object.entries(EVENTS))('accepts %s', async (type, data) => {
      const body = JSON.stringify(envelope(type, data));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(type));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    test('acknowledges unknown event types', async () => {
      const body = JSON.stringify(envelope('contact.merged', {}));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Notifuse event type'));
    });

    test('verifies any content type against the raw bytes', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    test('verifies a body with unusual whitespace byte for byte', async () => {
      const body = `{ "id" : "delivery_1",\n  "type":"contact.created", "timestamp":"2026-10-26T10:30:00Z", "workspace_id":"ws_1", "data": {"email":"a@example.com","id":"c1"} }`;
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    });

    test('accepts a space-separated list where one v1 entry matches', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const id = 'msg_multi';
      const ts = String(now());
      const old = sign(body, id, ts, 'whsec_' + Buffer.from('some-previous-key-0123456789abcd').toString('base64'));
      const headers = signedHeaders(body, { id, timestamp: ts, signature: `${old} ${sign(body, id, ts)}` });
      const res = await post(body, headers);
      expect(res.status).toBe(200);
    });
  });

  describe('svix-* header fallback', () => {
    test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    test('prefers webhook-* headers when both are present', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const good = signedHeaders(body);
      const res = await post(body, { ...good, 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,AAAA' });
      expect(res.status).toBe(200);
    });

    test('rejects a bad signature sent with svix-* headers', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const res = await post(body, signedHeaders(body, { prefix: 'svix', secret: 'whsec_' + Buffer.from('another-key-0123456789abcdefghij').toString('base64') }));
      expect(res.status).toBe(400);
    });
  });

  describe('rejections', () => {
    test('rejects a missing signature header', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const headers = signedHeaders(body);
      delete headers['webhook-signature'];
      const res = await post(body, headers);
      expect(res.status).toBe(400);
    });

    test('rejects all missing headers', async () => {
      const res = await post('{}', { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    test('rejects a wrong signature', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { signature: 'v1,' + Buffer.alloc(32, 1).toString('base64') }));
      expect(res.status).toBe(400);
    });

    test('rejects a signature made with another secret', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const other = 'whsec_' + Buffer.from('a-different-signing-key-0123456').toString('base64');
      const res = await post(body, signedHeaders(body, { secret: other }));
      expect(res.status).toBe(400);
    });

    test('rejects a tampered body', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const headers = signedHeaders(body);
      const res = await post(body.replace('user@example.com', 'evil@example.com'), headers);
      expect(res.status).toBe(400);
    });

    test('rejects a timestamp older than 5 minutes', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
      expect(res.status).toBe(400);
    });

    test('rejects a timestamp too far in the future', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
      expect(res.status).toBe(400);
    });

    test('rejects a non-numeric timestamp', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { timestamp: 'yesterday' }));
      expect(res.status).toBe(400);
    });

    test('rejects a v1a-only signature list', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const id = 'msg_v1a';
      const ts = String(now());
      const sig = sign(body, id, ts).replace('v1,', 'v1a,');
      const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: sig }));
      expect(res.status).toBe(400);
    });
  });

  describe('fail closed', () => {
    test('returns 500 when the secret is not configured', async () => {
      delete process.env.NOTIFUSE_WEBHOOK_SECRET;
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(500);
    });
  });

  describe('idempotency', () => {
    test('acknowledges a repeated webhook-id as a duplicate', async () => {
      const body = JSON.stringify(envelope('email.opened', emailData));
      const headers = signedHeaders(body, { id: 'msg_dupe_1' });
      const first = await post(body, headers);
      expect(first.body).toEqual({ received: true });
      const second = await post(body, headers);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyNotifuseWebhook', () => {
    test('returns the parsed event', () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const h = signedHeaders(body);
      const event = verifyNotifuseWebhook(body, {
        'webhook-id': h['webhook-id'],
        'webhook-timestamp': h['webhook-timestamp'],
        'webhook-signature': h['webhook-signature'],
      });
      expect(event.type).toBe('contact.created');
      expect(event.workspace_id).toBe('ws_1234567890');
    });
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
