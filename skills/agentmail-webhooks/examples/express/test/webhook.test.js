// Generated with: agentmail-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('agentmail-test-signing-key-01234').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-webhook-signing-key00').toString('base64');

process.env.AGENTMAIL_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign exactly like AgentMail (Svix). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, opts = {}) {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/agentmail').set(headers).send(rawBody);
}

const uniqueId = () => crypto.randomBytes(16).toString('hex');

function messageReceived(overrides = {}) {
  return {
    type: 'event',
    event_type: 'message.received',
    event_id: uniqueId(),
    message: {
      inbox_id: 'inbox_456def',
      thread_id: 'thd_789ghi',
      message_id: '<abc123@agentmail.to>',
      labels: ['received'],
      timestamp: '2023-10-27T10:00:00Z',
      from: 'Jane Doe <jane@example.com>',
      to: ['Support Agent <support@agentmail.to>'],
      subject: 'Question about my account',
      preview: 'A short preview of the email text...',
      text: 'The full text body of the email.',
      html: '<html>...</html>',
      size: 2048,
      updated_at: '2023-10-27T10:00:00Z',
      created_at: '2023-10-27T10:00:00Z',
    },
    thread: {
      inbox_id: 'inbox_456def',
      thread_id: 'thd_789ghi',
      labels: ['received'],
      subject: 'Question about my account',
      last_message_id: '<abc123@agentmail.to>',
      message_count: 1,
    },
    ...overrides,
  };
}

const PAYLOADS = {
  'message.sent': {
    send: { message_id: '<abc123@agentmail.to>', timestamp: '2023-10-27T10:05:00Z', recipients: ['recipient@example.com'] },
  },
  'message.delivered': {
    delivery: { message_id: '<abc123@agentmail.to>', timestamp: '2023-10-27T10:06:00Z', recipients: ['recipient@example.com'] },
  },
  'message.bounced': {
    bounce: {
      message_id: '<abc123@agentmail.to>',
      timestamp: '2023-10-27T10:07:00Z',
      type: 'Permanent',
      sub_type: 'General',
      recipients: [{ address: 'invalid@example.com', status: 'bounced' }],
    },
  },
  'message.complained': {
    complaint: {
      message_id: '<abc123@agentmail.to>',
      timestamp: '2023-10-27T10:08:00Z',
      type: 'abuse',
      sub_type: 'spam',
      recipients: ['complainer@example.com'],
    },
  },
  'message.rejected': {
    reject: { message_id: '<abc123@agentmail.to>', timestamp: '2023-10-27T10:09:00Z', reason: 'Invalid recipient address' },
  },
  'message.opened': { open: { message_id: '<abc123@agentmail.to>', timestamp: '2023-10-27T10:15:00Z' } },
  'message.security.review': {
    message: {
      organization_id: '7f0c2a52-6a8e-4d0e-9a5e-2f3b1c4d5e6f',
      message_id: '<abc123@agentmail.to>',
      agent_armor: { status: 'complete', verdict: 'review', reason: 'Suspicious', model: 'armor-2026-10-07' },
    },
  },
  'domain.verified': {
    domain: { domain_id: 'dom_123abc', status: 'verified', feedback_enabled: true, records: [] },
  },
  'calendar.event.starting': {
    calendar_event: { event_id: '3f8a2c1e', kind: 'single', title: 'Intro call with Acme' },
    scheduled_at: '2026-10-15T18:00:00Z',
  },
};

beforeEach(() => {
  process.env.AGENTMAIL_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts message.received', async () => {
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Question about my account'));
  });

  it.each(Object.keys(PAYLOADS))('accepts %s', async (eventType) => {
    const body = JSON.stringify({ type: 'event', event_type: eventType, event_id: uniqueId(), ...PAYLOADS[eventType] });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts message.received.spam (same shape as message.received)', async () => {
    const body = JSON.stringify(messageReceived({ event_type: 'message.received.spam' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ type: 'event', event_type: 'something.new', event_id: uniqueId() });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(messageReceived());
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(messageReceived());
    const headers = signedHeaders(body);
    const res = await post(body.replace('Question', 'Urgent'), headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a signature made with another webhook secret', async () => {
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp in the future', async () => {
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body, { signature: 'garbage' }));
    expect(res.status).toBe(400);
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
    const body = JSON.stringify(messageReceived());
    const headers = signedHeaders(body);
    delete headers[name];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing Svix signature headers' });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.AGENTMAIL_WEBHOOK_SECRET;
    const body = JSON.stringify(messageReceived());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});

describe('deduplication', () => {
  it('dedupes on event_id even when svix-id differs (org vs inbox webhook)', async () => {
    const event = messageReceived();
    const body = JSON.stringify(event);

    const first = await post(body, signedHeaders(body, { id: 'msg_org_level' }));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const second = await post(body, signedHeaders(body, { id: 'msg_inbox_level' }));
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('health', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
