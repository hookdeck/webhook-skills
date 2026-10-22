// Generated with: cloudtalk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('cloudtalk-test-signing-key-0123').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-endpoint-signing-key').toString('base64');

process.env.CLOUDTALK_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign exactly like CloudTalk (Svix). */
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
    'Content-Type': opts.contentType ?? 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/cloudtalk').set(headers).send(rawBody);
}

function envelope(type, data, overrides = {}) {
  return {
    event_id: crypto.randomUUID(),
    type,
    version: 'v1',
    occurred_at: '2026-08-17T09:34:21.512Z',
    company_id: '123456',
    data,
    ...overrides,
  };
}

const NUMBER = {
  number_e164: '+12025550178',
  id: '9911',
  internal_name: 'Sales line',
  number_type: 'fixed',
  country: 'US',
};
const USER = { id: '987654', name: 'John Smith', email: 'john.smith@example.com', role: 'agent', extension: '1001' };
const CONTACT = { id: '44210', name: 'Jane Doe', company: 'Acme Inc.', phones: ['+12025550143'], emails: ['jane.doe@example.com'] };

const CALL = { call_uuid: '018f7d3a-2b4c-7e5f-9a6b-1c2d3e4f5a6b' };
const MESSAGE = {
  id: '987654',
  conversation_id: '55321',
  channel: 'mms',
  external_number: '+12025550143',
  internal_number: NUMBER,
  body: 'Hi Jane, your appointment is confirmed.',
  contact: CONTACT,
  user: USER,
};

const PAYLOADS = {
  'call.started': { ...CALL, direction: 'inbound', external_number: '+12025550143', internal_number: NUMBER },
  'call.ringing': { ...CALL, direction: 'inbound', external_number: '+12025550143', internal_number: NUMBER },
  'call.answered': { ...CALL, direction: 'inbound', external_number: '+12025550143', internal_number: NUMBER },
  'call.held': { ...CALL, user: USER },
  'call.resumed': { ...CALL, user: USER },
  'call.ended': {
    call_id: '143223459',
    call_uuid: CALL.call_uuid,
    direction: 'incoming',
    external_number: '+12025550143',
    internal_number: NUMBER,
    started_at: '2026-08-17T09:38:05Z',
    ended_at: '2026-08-17T09:41:23Z',
    talking_time: 154,
    waiting_time: 44,
    duration: 198,
    recorded: true,
    is_voicemail: false,
    contacts: [CONTACT],
    contacts_total: 1,
    user: USER,
  },
  'call.recording_ready': { call_id: '143223459', call_uuid: CALL.call_uuid, contacts: [CONTACT], contacts_total: 1 },
  'call.tags_modified': { ...CALL },
  'contact.created': { ...CONTACT, tags: ['vip'], created_at: '2026-08-17T09:34:21Z' },
  'contact.updated': { ...CONTACT },
  'contact.deleted': { id: '44210' },
  'user.created': { ...USER },
  'user.updated': { ...USER },
  'user.deleted': { id: '987654' },
  'user.status_changed': { user_id: '4207', status: 'idle', sub_status: 'Lunch', sub_status_id: '19' },
  'message.sent': { ...MESSAGE, direction: 'outbound' },
  'message.received': { ...MESSAGE, direction: 'inbound' },
  'transcript.ready': { ...CALL },
  'cidata.ready': { ...CALL },
  'voice_agent.extracted_data_ready': {},
  'dialer.disposition_created': {},
  'dialer.survey_filled': {},
};

beforeEach(() => {
  process.env.CLOUDTALK_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it.each(Object.keys(PAYLOADS))('accepts %s', async (type) => {
    const body = JSON.stringify(envelope(type, PAYLOADS[type]));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('dispatches on the envelope type', async () => {
    const body = JSON.stringify(envelope('call.ended', PAYLOADS['call.ended']));
    await post(body, signedHeaders(body));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('198s total'));
  });

  it('verifies regardless of the request content type', async () => {
    const body = JSON.stringify(envelope('contact.created', PAYLOADS['contact.created']));
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(envelope('something.new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(envelope('contact.created', PAYLOADS['contact.created']));
    const headers = signedHeaders(body);
    const res = await post(body.replace('Jane', 'Mallory'), headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a signature made with another endpoint secret', async () => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp in the future', async () => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const res = await post(body, signedHeaders(body, { signature: 'garbage' }));
    expect(res.status).toBe(400);
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const headers = signedHeaders(body);
    delete headers[name];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing Svix signature headers' });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.CLOUDTALK_WEBHOOK_SECRET;
    const body = JSON.stringify(envelope('call.started', PAYLOADS['call.started']));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});

describe('deduplication', () => {
  it('acknowledges a retry of the same event_id without reprocessing it', async () => {
    const body = JSON.stringify(envelope('call.ended', PAYLOADS['call.ended']));
    const id = 'msg_retry_test';

    const first = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    // A retry is re-signed with a fresh timestamp but keeps svix-id and event_id.
    const second = await post(body, signedHeaders(body, { id, timestamp: now() + 1 }));
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
